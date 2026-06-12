#include <SoftwareSerial.h>

SoftwareSerial sim808(2, 3); // RX, TX

// ── Pin & Config ────────────────────────────────────────────
const int PIN_PWRKEY    = 4;
const int PIN_PANIC     = 8;
const int PIN_VIBRATOR  = 7;
const int PIN_LED_GREEN = 9;
const int PIN_LED_RED   = 10;

// ── Backend config ──────────────────────────────────────────
const char VEHICLE_ID[]  PROGMEM = "VH-001";
const char APN[]         PROGMEM = "internet";   // ← change to your SIM's APN
const char API_HOST[]    PROGMEM = "yourdomain.com"; // ← your backend host
const char API_TRIP[]    PROGMEM = "/api/trip/active";
const char API_GPS[]     PROGMEM = "/api/gps";
const char API_SOS[]     PROGMEM = "/api/sos";

// ── Trip / contact state ────────────────────────────────────
char  tripId[24]         = "";   // active trip ID from backend
char  contacts[5][16]    = {};   // up to 5 phone numbers
int   contactCount       = 0;
bool  tripActive         = false;

// ── Timing ──────────────────────────────────────────────────
const unsigned long TRIP_POLL_MS = 30000UL;  // poll trip every 30s
const unsigned long GPS_POST_MS  = 10000UL;  // post GPS every 10s
unsigned long lastTripPoll       = 0;
unsigned long lastGpsPost        = 0;

// ── Panic state ─────────────────────────────────────────────
const unsigned long PANIC_HOLD_MS = 10000UL;
unsigned long panicPressStart     = 0;
unsigned long lastCountSec        = 0xFFFFFFFFUL;
bool panicArmed                   = false;
bool panicSMSSent                 = false;

// ── GPS buffers ─────────────────────────────────────────────
char latBuf[12];
char lonBuf[12];
char dateBuf[12];
char timeBuf[10];

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(9600);
  pinMode(PIN_PANIC,     INPUT_PULLUP);
  pinMode(PIN_VIBRATOR,  OUTPUT); digitalWrite(PIN_VIBRATOR,  HIGH);
  pinMode(PIN_LED_GREEN, OUTPUT); digitalWrite(PIN_LED_GREEN, LOW);
  pinMode(PIN_LED_RED,   OUTPUT); digitalWrite(PIN_LED_RED,   LOW);

  Serial.println(F("=== SOS Tracker ==="));
  sim808.begin(9600);
  powerOnSIM808();

  delay(1000);
  sim808.println(F("AT+CGNSPWR=1"));
  delay(1000);
  clearBuffer();

  initGPRS(); // bring up GPRS bearer

  Serial.println(F("GPS acquiring lock..."));
  Serial.println(F("--------------------------"));
}

// ============================================================
//  MAIN LOOP
// ============================================================
void loop() {
  checkPanicButton();

  if (!panicArmed) {
    powerOffCheck();

    // ── GPS poll ──────────────────────────────────────────
    sim808.println(F("AT+CGNSINF"));
    delay(300);
    processGPSData();

    unsigned long now = millis();

    // ── Trip poll every 30s ───────────────────────────────
    if (now - lastTripPoll >= TRIP_POLL_MS) {
      lastTripPoll = now;
      pollTrip();
    }

    // ── Post GPS to backend every 10s (only if trip active) ──
    if (tripActive && (now - lastGpsPost >= GPS_POST_MS)) {
      lastGpsPost = now;
      if (latBuf[0] != '\0') postGPS();
    }

    // Break wait into slices so panic stays responsive
    for (int i = 0; i < 47; i++) {
      delay(100);
      checkPanicButton();
    }
  } else {
    delay(100);
  }
}

// ============================================================
//  GPRS INIT — brings up bearer so HTTP works
// ============================================================
void initGPRS() {
  Serial.println(F("Bringing up GPRS..."));

  char apn[20];
  strcpy_P(apn, APN);

  // Set bearer profile
  sim808.println(F("AT+SAPBR=3,1,\"Contype\",\"GPRS\""));
  delay(500); clearBuffer();

  sim808.print(F("AT+SAPBR=3,1,\"APN\",\""));
  sim808.print(apn);
  sim808.println('"');
  delay(500); clearBuffer();

  // Open bearer
  sim808.println(F("AT+SAPBR=1,1"));
  delay(3000); clearBuffer();

  // Check IP assigned
  sim808.println(F("AT+SAPBR=2,1"));
  delay(500);
  showModuleResponse();

  Serial.println(F("GPRS ready."));
  Serial.println(F("--------------------------"));
}

// ============================================================
//  HTTP GET — returns true on 200, fills respBuf
// ============================================================
bool httpGET(const char* path, char* respBuf, int respLen) {
  char host[40]; strcpy_P(host, API_HOST);

  sim808.println(F("AT+HTTPINIT"));
  delay(300); clearBuffer();

  sim808.println(F("AT+HTTPPARA=\"CID\",1"));
  delay(200); clearBuffer();

  // Build full URL
  sim808.print(F("AT+HTTPPARA=\"URL\",\"http://"));
  sim808.print(host);
  sim808.print(path);
  sim808.println('"');
  delay(300); clearBuffer();

  sim808.println(F("AT+HTTPACTION=0")); // GET
  delay(6000);

  // Read status line
  static char statusBuf[40];
  memset(statusBuf, 0, sizeof(statusBuf));
  int p = 0;
  unsigned long t = millis();
  while (millis() - t < 2000 && p < 39) {
    if (sim808.available()) statusBuf[p++] = sim808.read();
  }

  bool ok = (strstr(statusBuf, ",200,") != NULL);

  if (ok) {
    sim808.println(F("AT+HTTPREAD"));
    delay(1000);
    memset(respBuf, 0, respLen);
    int ri = 0;
    t = millis();
    while (millis() - t < 3000 && ri < respLen - 1) {
      if (sim808.available()) respBuf[ri++] = sim808.read();
    }
  }

  sim808.println(F("AT+HTTPTERM"));
  delay(300); clearBuffer();
  return ok;
}

// ============================================================
//  HTTP POST — posts JSON body, returns true on 200/201
// ============================================================
bool httpPOST(const char* path, const char* jsonBody) {
  char host[40]; strcpy_P(host, API_HOST);

  sim808.println(F("AT+HTTPINIT"));
  delay(300); clearBuffer();

  sim808.println(F("AT+HTTPPARA=\"CID\",1"));
  delay(200); clearBuffer();

  sim808.print(F("AT+HTTPPARA=\"URL\",\"http://"));
  sim808.print(host);
  sim808.print(path);
  sim808.println('"');
  delay(300); clearBuffer();

  sim808.println(F("AT+HTTPPARA=\"CONTENT\",\"application/json\""));
  delay(200); clearBuffer();

  int bodyLen = strlen(jsonBody);
  sim808.print(F("AT+HTTPDATA="));
  sim808.print(bodyLen);
  sim808.println(F(",5000"));
  delay(1000); clearBuffer();

  sim808.print(jsonBody);
  delay(2000); clearBuffer();

  sim808.println(F("AT+HTTPACTION=1")); // POST
  delay(6000);

  static char statusBuf[40];
  memset(statusBuf, 0, sizeof(statusBuf));
  int p = 0;
  unsigned long t = millis();
  while (millis() - t < 2000 && p < 39) {
    if (sim808.available()) statusBuf[p++] = sim808.read();
  }

  bool ok = (strstr(statusBuf, ",200,") || strstr(statusBuf, ",201,"));

  sim808.println(F("AT+HTTPTERM"));
  delay(300); clearBuffer();
  return ok;
}

// ============================================================
//  POLL TRIP  — GET /api/trip/active?vehicleId=VH-001
//  Parses tripId and contact list from JSON response
// ============================================================
void pollTrip() {
  Serial.println(F("[TRIP] Polling backend..."));

  char vehicleId[12]; strcpy_P(vehicleId, VEHICLE_ID);
  char apiTrip[30];   strcpy_P(apiTrip,   API_TRIP);

  // Build path: /api/trip/active?vehicleId=VH-001
  char path[60];
  snprintf(path, sizeof(path), "%s?vehicleId=%s", apiTrip, vehicleId);

  static char resp[400];
  if (!httpGET(path, resp, sizeof(resp))) {
    Serial.println(F("[TRIP] No active trip."));
    tripActive    = false;
    contactCount  = 0;
    tripId[0]     = '\0';
    return;
  }

  // ── Parse tripId ──────────────────────────────────────
  // Expects: {"tripId":"abc123","contacts":["+234...","+234..."]}
  char* tidPtr = strstr(resp, "\"tripId\":\"");
  if (tidPtr) {
    tidPtr += 10;
    int i = 0;
    while (*tidPtr && *tidPtr != '"' && i < 23)
      tripId[i++] = *tidPtr++;
    tripId[i] = '\0';
  }

  // ── Parse contacts array ──────────────────────────────
  contactCount = 0;
  char* arr = strstr(resp, "\"contacts\":[");
  if (arr) {
    arr += 12; // skip past ["contacts":[
    while (*arr && *arr != ']' && contactCount < 5) {
      // find opening quote
      while (*arr && *arr != '"' && *arr != ']') arr++;
      if (*arr != '"') break;
      arr++; // skip "
      int i = 0;
      while (*arr && *arr != '"' && i < 15)
        contacts[contactCount][i++] = *arr++;
      contacts[contactCount][i] = '\0';
      if (i > 0) contactCount++;
      if (*arr == '"') arr++; // skip closing "
    }
  }

  tripActive = (tripId[0] != '\0' && contactCount > 0);

  Serial.print(F("[TRIP] Active: "));
  Serial.print(tripId);
  Serial.print(F(" | Contacts: "));
  Serial.println(contactCount);
}

// ============================================================
//  POST GPS  — POST /api/gps
// ============================================================
void postGPS() {
  char apiGps[20]; strcpy_P(apiGps, API_GPS);
  char vehicleId[12]; strcpy_P(vehicleId, VEHICLE_ID);

  // {"vehicleId":"VH-001","tripId":"abc123","lat":5.47,"lon":7.54,"date":"12/06/2026","time":"01:00:00"}
  static char body[160];
  snprintf(body, sizeof(body),
    "{\"vehicleId\":\"%s\",\"tripId\":\"%s\",\"lat\":%s,\"lon\":%s,\"date\":\"%s\",\"time\":\"%s\"}",
    vehicleId, tripId, latBuf, lonBuf, dateBuf, timeBuf);

  Serial.println(F("[GPS] Posting location..."));
  if (httpPOST(apiGps, body)) {
    Serial.println(F("[GPS] Posted OK."));
  } else {
    Serial.println(F("[GPS] Post failed."));
  }
}

// ============================================================
//  POST SOS EVENT — POST /api/sos
// ============================================================
void postSOS() {
  char apiSos[20]; strcpy_P(apiSos, API_SOS);
  char vehicleId[12]; strcpy_P(vehicleId, VEHICLE_ID);

  static char body[160];
  snprintf(body, sizeof(body),
    "{\"vehicleId\":\"%s\",\"tripId\":\"%s\",\"lat\":%s,\"lon\":%s,\"date\":\"%s\",\"time\":\"%s\"}",
    vehicleId, tripId, latBuf, lonBuf, dateBuf, timeBuf);

  Serial.println(F("[SOS] Posting SOS event to backend..."));
  if (httpPOST(apiSos, body)) {
    Serial.println(F("[SOS] Backend notified OK."));
  } else {
    Serial.println(F("[SOS] Backend post failed."));
  }
}

// ============================================================
//  PANIC BUTTON
// ============================================================
void checkPanicButton() {
  bool buttonDown = (digitalRead(PIN_PANIC) == LOW);

  if (buttonDown) {
    if (!panicArmed) {
      panicPressStart = millis();
      panicArmed      = true;
      panicSMSSent    = false;
      lastCountSec    = 0xFFFFFFFFUL;
      Serial.println(F("\n[PANIC] Hold 10s to send SOS..."));
    }

    unsigned long heldMs  = millis() - panicPressStart;
    unsigned long heldSec = heldMs / 1000UL;

    if (heldSec != lastCountSec && heldSec <= 10) {
      lastCountSec = heldSec;
      unsigned long remaining = 10 - heldSec;
      Serial.print(F("  ["));
      for (int i = 0; i < 10; i++)
        Serial.print(i < (int)heldSec ? '|' : '.');
      Serial.print(F("] "));
      if (remaining > 0) { Serial.print(remaining); Serial.println(F("s left")); }
      else                  Serial.println(F("SENDING!"));
    }

    if (heldMs >= PANIC_HOLD_MS && !panicSMSSent) {
      panicSMSSent = true;
      Serial.println(F("\n>> 10s confirmed. Fetching GPS..."));
      triggerPanicSMS();
    }

  } else {
    if (panicArmed) {
      if (!panicSMSSent) Serial.println(F("[PANIC] Released early - cancelled."));
      panicArmed = false;
    }
  }
}

// ============================================================
//  PANIC → GPS → SMS + BACKEND
// ============================================================
void triggerPanicSMS() {
  bool gotFix = false;

  for (int attempt = 0; attempt < 3 && !gotFix; attempt++) {
    Serial.print(F("  GPS attempt ")); Serial.print(attempt + 1); Serial.println(F("/3..."));
    sim808.println(F("AT+CGNSINF"));
    delay(600);
    gotFix = readAndParseGPS();
    if (!gotFix) delay(1000);
  }

  if (gotFix) {
    Serial.println(F("  Fix acquired. Sending SOS..."));
    sendSOS_SMS();
  } else {
    Serial.println(F("  No fix. Sending alert only..."));
    sendSOS_NoFix();
  }

  // Always post SOS event to backend regardless of GPS fix
  postSOS();
}

// ============================================================
//  GPS PARSER
// ============================================================
bool readAndParseGPS() {
  static char buf[120];
  memset(buf, 0, sizeof(buf));
  int pos = 0;
  unsigned long t = millis();
  while (millis() - t < 400 && pos < 119) {
    if (sim808.available()) buf[pos++] = sim808.read();
  }

  char* p = strstr(buf, "+CGNSINF:");
  if (!p) return false;

  char* tok = strtok(p + 9, ",");
  char* fields[5] = {0};
  int   fi = 0;
  while (tok && fi < 5) {
    while (*tok == ' ') tok++;
    fields[fi++] = tok;
    tok = strtok(NULL, ",");
  }

  if (fi < 5) return false;
  fields[1].trim(); // already fixed per earlier session
  if (fields[1][0] != '1') return false;

  char* rawDT = fields[2];
  if (strlen(rawDT) < 14) return false;

  strncpy(latBuf, fields[3], sizeof(latBuf) - 1);
  strncpy(lonBuf, fields[4], sizeof(lonBuf) - 1);
  for (int i = 0; i < (int)sizeof(lonBuf); i++) {
    if (lonBuf[i] != '.' && (lonBuf[i] < '0' || lonBuf[i] > '9') && lonBuf[i] != '-' && lonBuf[i] != 0) {
      lonBuf[i] = 0; break;
    }
  }

  int yearInt  = (rawDT[0]-'0')*1000+(rawDT[1]-'0')*100+(rawDT[2]-'0')*10+(rawDT[3]-'0');
  int monthInt = (rawDT[4]-'0')*10+(rawDT[5]-'0');
  int dayInt   = (rawDT[6]-'0')*10+(rawDT[7]-'0');
  int rawHour  = (rawDT[8]-'0')*10+(rawDT[9]-'0');
  int minInt   = (rawDT[10]-'0')*10+(rawDT[11]-'0');
  int secInt   = (rawDT[12]-'0')*10+(rawDT[13]-'0');

  int localHour = rawHour + 1;
  if (localHour >= 24) {
    localHour = 0; dayInt++;
    const byte dim[] = {0,31,28,31,30,31,30,31,31,30,31,30,31};
    int maxDay = dim[monthInt];
    if (monthInt == 2 && ((yearInt%4==0 && yearInt%100!=0) || yearInt%400==0)) maxDay = 29;
    if (dayInt > maxDay) { dayInt = 1; monthInt++; if (monthInt > 12) { monthInt = 1; yearInt++; } }
  }

  snprintf(dateBuf, sizeof(dateBuf), "%02d/%02d/%04d", dayInt, monthInt, yearInt);
  snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d:%02d", localHour, minInt, secInt);
  return true;
}

// ============================================================
//  GPS LOOP DISPLAY
// ============================================================
void processGPSData() {
  bool got = readAndParseGPS();
  if (panicArmed) return;

  if (got) {
    digitalWrite(PIN_LED_RED, HIGH);
    Serial.println(F("\n>> LOCATION LOCKED"));
    Serial.print(F("   Date: "));        Serial.println(dateBuf);
    Serial.print(F("   Time (WAT): "));  Serial.println(timeBuf);
    Serial.print(F("   Maps: https://www.google.com/maps?q="));
    Serial.print(latBuf); Serial.print(','); Serial.println(lonBuf);
  } else {
    digitalWrite(PIN_LED_RED, LOW);
    Serial.println(F("\n>> Synchronising with GPS..."));
  }
  Serial.println(F("--------------------------"));
}

// ============================================================
//  SMS — with location  (loops through all contacts)
// ============================================================
void sendSOS_SMS() {
  sim808.println(F("AT+CMGF=1"));
  delay(500); showModuleResponse();

  // Send to each registered contact
  int sent = 0;
  for (int c = 0; c < contactCount; c++) {
    sim808.print(F("AT+CMGS=\"")); sim808.print(contacts[c]); sim808.println('"');
    delay(500); showModuleResponse();

    sim808.println(F("EMERGENCY ALERT!"));
    sim808.print(F("Date: "));       sim808.println(dateBuf);
    sim808.print(F("Time (WAT): ")); sim808.println(timeBuf);
    sim808.print(F("https://www.google.com/maps?q="));
    sim808.print(latBuf); sim808.print(','); sim808.println(lonBuf);

    delay(500);
    sim808.write(26);
    delay(5000);
    showModuleResponse();
    sent++;

    Serial.print(F("  SMS sent to: ")); Serial.println(contacts[c]);
  }

  // Fallback: if no contacts loaded, SMS was already sent via hardcoded number
  if (contactCount == 0) {
    Serial.println(F("  No contacts loaded — no SMS sent."));
  }

  vibrateConfirm(1500);

  Serial.println(F("\n+---------------------------+"));
  Serial.print(F("|  SOS SMS SENT TO "));
  Serial.print(sent);
  Serial.println(F(" contact(s) |"));
  Serial.println(F("|  Release the panic button |"));
  Serial.println(F("+---------------------------+\n"));
}

// ============================================================
//  SMS — no GPS fix
// ============================================================
void sendSOS_NoFix() {
  sim808.println(F("AT+CMGF=1"));
  delay(500); showModuleResponse();

  for (int c = 0; c < contactCount; c++) {
    sim808.print(F("AT+CMGS=\"")); sim808.print(contacts[c]); sim808.println('"');
    delay(500); showModuleResponse();

    sim808.println(F("EMERGENCY ALERT!"));
    sim808.println(F("Panic triggered. No GPS fix."));
    sim808.println(F("Locate vehicle immediately."));

    delay(500);
    sim808.write(26);
    delay(5000);
    showModuleResponse();
    Serial.print(F("  SMS sent to: ")); Serial.println(contacts[c]);
  }

  vibrateConfirm(1500);

  Serial.println(F("\n+---------------------------+"));
  Serial.println(F("|  SOS SENT (no GPS fix)    |"));
  Serial.println(F("|  Release the panic button |"));
  Serial.println(F("+---------------------------+\n"));
}

// ============================================================
//  UTILITIES
// ============================================================
void clearBuffer() { while (sim808.available()) sim808.read(); }
void showModuleResponse() { while (sim808.available()) Serial.write(sim808.read()); }
void vibrateConfirm(int durationMs) {
  digitalWrite(PIN_VIBRATOR, LOW); delay(durationMs); digitalWrite(PIN_VIBRATOR, HIGH);
}

// ============================================================
//  SIM808 AUTO POWER-ON
// ============================================================
void powerOnSIM808() {
  Serial.println(F("Checking SIM808 state..."));
  sim808.println(F("AT")); delay(500);
  if (sim808.available()) {
    Serial.println(F("SIM808 already on. OK"));
    clearBuffer(); digitalWrite(PIN_LED_GREEN, HIGH); return;
  }

  Serial.println(F("Powering on SIM808..."));
  pinMode(PIN_PWRKEY, OUTPUT);
  digitalWrite(PIN_PWRKEY, HIGH); delay(200);
  digitalWrite(PIN_PWRKEY, LOW);  delay(2500);
  digitalWrite(PIN_PWRKEY, HIGH);

  Serial.print(F("Waiting for boot"));
  unsigned long start = millis();
  while (millis() - start < 10000) {
    sim808.println(F("AT")); delay(500);
    if (sim808.available()) {
      clearBuffer();
      Serial.println(F(" OK"));
      Serial.println(F("SIM808 is on."));
      digitalWrite(PIN_LED_GREEN, HIGH); return;
    }
    Serial.print('.');
  }

  haltWithError();
}

// ============================================================
//  SIM808 ALIVE CHECK
// ============================================================
void powerOffCheck() {
  sim808.println(F("AT")); delay(300);
  if (sim808.available()) {
    clearBuffer(); digitalWrite(PIN_LED_GREEN, HIGH); return;
  }

  Serial.println(F("\n[WARN] SIM808 lost. Rebooting..."));
  digitalWrite(PIN_LED_GREEN, LOW); digitalWrite(PIN_LED_RED, LOW);

  digitalWrite(PIN_PWRKEY, HIGH); delay(200);
  digitalWrite(PIN_PWRKEY, LOW);  delay(2500);
  digitalWrite(PIN_PWRKEY, HIGH);

  Serial.print(F("Waiting for boot"));
  unsigned long start = millis();
  while (millis() - start < 10000) {
    sim808.println(F("AT")); delay(500);
    if (sim808.available()) {
      clearBuffer();
      Serial.println(F(" OK"));
      Serial.println(F("SIM808 back on."));
      digitalWrite(PIN_LED_GREEN, HIGH);
      sim808.println(F("AT+CGNSPWR=1")); delay(1000); clearBuffer();
      initGPRS(); // re-init GPRS bearer after reboot
      Serial.println(F("GPS engine restarted."));
      Serial.println(F("--------------------------"));
      return;
    }
    Serial.print('.');
  }

  haltWithError();
}

// ============================================================
//  HALT — shared error handler
// ============================================================
void haltWithError() {
  Serial.println();
  Serial.println(F("╔══════════════════════════════════╗"));
  Serial.println(F("║      ⚠  SIM808 NOT FOUND         ║"));
  Serial.println(F("╠══════════════════════════════════╣"));
  Serial.println(F("║  Please check:                   ║"));
  Serial.println(F("║  1. SIM808 power supply (4V)     ║"));
  Serial.println(F("║  2. PWRKEY wiring on D4          ║"));
  Serial.println(F("║  3. Try powering on manually     ║"));
  Serial.println(F("║  Reset Arduino when ready.       ║"));
  Serial.println(F("╚══════════════════════════════════╝"));
  for (int i = 0; i < 5; i++) {
    digitalWrite(PIN_VIBRATOR, LOW);  delay(500);
    digitalWrite(PIN_VIBRATOR, HIGH); delay(300);
  }
  while (true) { delay(1000); }
}