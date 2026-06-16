  // ── Prototype hardware constraint ─────────────────────────────────────────
  // This system uses a DIY SIM808 GSM module wired to an Arduino Uno, which
  // has only 2 KB of SRAM and a 64-byte SoftwareSerial RX buffer.
  // To keep the HTTP response payload within the Arduino's 300-byte read
  // buffer, two constraints are applied here:
  //
  //   1. LIMIT 5  — matches the Arduino's hard-coded contacts[5][16] array.
  //   2. phoneNumber only — passengerId (a 36-char UUID) is omitted because
  //      the Arduino never uses it and including it bloats each contact entry
  //      from ~28 bytes to ~85 bytes, pushing a 5-contact payload over the
  //      buffer limit and causing silent truncation on the hardware.
  //
  // A production build with a more capable modem (e.g. SIM7600, ESP32 with
  // GSM shield, or a proper IoT gateway) could remove both constraints.
  // ────────────────────────────────────────────────────────────────────────
  
#include <SoftwareSerial.h>

SoftwareSerial sim808(2, 3); // RX, TX

// ── Pin & Config ────────────────────────────────────────────
const int PIN_PWRKEY    = 4;
const int PIN_PANIC     = 8;
const int PIN_VIBRATOR  = 7;
const int PIN_LED_GREEN = 9;
const int PIN_LED_RED   = 10;

// ── Backend config ──────────────────────────────────────────
const char VEHICLE_ID[] PROGMEM = "VH-001";
const char APN[]        PROGMEM = "web.gprs.mtnnigeria.net";
const char API_HOST[]   PROGMEM = "141.148.66.227:4000";
const char API_TRIP[]   PROGMEM = "/api/trip/active";
const char API_GPS[]    PROGMEM = "/api/gps/update";
const char API_SOS[]    PROGMEM = "/api/sos/trigger";

// ── Shared global buffers (avoids static locals in functions) ─
// statusBuf: holds "+HTTPACTION: 0,200,NNN" reply
static char statusBuf[40];
// respBuf: HTTP GET response body
static char respBuf[300];
// bodyBuf: HTTP POST JSON body (longest is ~160 chars)
static char bodyBuf[165];

// ── Trip / contact state ────────────────────────────────────
char  tripId[37]      = "";
char  contacts[5][16] = {};   // E.164 max is 15 chars + NUL
int   contactCount    = 0;
bool  tripActive      = false;

// ── Timing ──────────────────────────────────────────────────
const unsigned long TRIP_POLL_MS = 30000UL;
const unsigned long GPS_POST_MS  = 10000UL;
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

  initGPRS();

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

    sim808.println(F("AT+CGNSINF"));
    delay(300);
    processGPSData();

    unsigned long now = millis();

    if (now - lastTripPoll >= TRIP_POLL_MS) {
      lastTripPoll = now;
      pollTrip();
    }

    if (tripActive && (now - lastGpsPost >= GPS_POST_MS)) {
      lastGpsPost = now;
      if (latBuf[0] != '\0') postGPS();
    }

    for (int i = 0; i < 47; i++) {
      delay(100);
      checkPanicButton();
    }
  } else {
    delay(100);
  }
}

// ============================================================
//  GPRS INIT
// ============================================================
void initGPRS() {
  Serial.println(F("Bringing up GPRS..."));

  // Read APN from PROGMEM directly into bodyBuf (reuse; not used yet)
  strcpy_P(bodyBuf, APN);

  sim808.println(F("AT+SAPBR=3,1,\"Contype\",\"GPRS\""));
  delay(500); clearBuffer();

  sim808.print(F("AT+SAPBR=3,1,\"APN\",\""));
  sim808.print(bodyBuf);
  sim808.println('"');
  delay(500); clearBuffer();

  sim808.println(F("AT+SAPBR=1,1"));
  delay(3000); clearBuffer();

  sim808.println(F("AT+SAPBR=2,1"));
  delay(500);
  showModuleResponse();

  Serial.println(F("GPRS ready."));
  Serial.println(F("--------------------------"));
}

// ============================================================
//  HTTP GET  — uses global statusBuf / respBuf
// ============================================================
bool httpGET(const char* path) {
  // API_HOST is PROGMEM — build URL using bodyBuf as scratch
  strcpy_P(bodyBuf, API_HOST);

  sim808.println(F("AT+HTTPINIT"));
  delay(300); clearBuffer();

  sim808.println(F("AT+HTTPPARA=\"CID\",1"));
  delay(200); clearBuffer();

  sim808.print(F("AT+HTTPPARA=\"URL\",\"http://"));
  sim808.print(bodyBuf);   // host
  sim808.print(path);
  sim808.println('"');
  delay(300); clearBuffer();

  sim808.println(F("AT+HTTPACTION=0"));
  delay(6000);

  memset(statusBuf, 0, sizeof(statusBuf));
  int p = 0;
  unsigned long t = millis();
  while (millis() - t < 2000 && p < 39)
    if (sim808.available()) statusBuf[p++] = sim808.read();

  bool ok = (strstr(statusBuf, ",200,") != NULL);

  if (ok) {
    sim808.println(F("AT+HTTPREAD"));
    // No delay here — SIM808 starts sending at ~1 char/ms (9600 baud).
    // A delay(1000) would let the 64-byte SoftwareSerial buffer overflow and
    // drop everything beyond byte 64 before the Arduino even starts reading.
    // Reading immediately captures the full response in real-time.
    memset(respBuf, 0, sizeof(respBuf));
    int ri = 0;
    t = millis();
    while (millis() - t < 4000 && ri < (int)sizeof(respBuf) - 1)
      if (sim808.available()) respBuf[ri++] = sim808.read();
  }

  sim808.println(F("AT+HTTPTERM"));
  delay(300); clearBuffer();
  return ok;
}

// ============================================================
//  HTTP POST  — uses global statusBuf; body is already in bodyBuf
// ============================================================
bool httpPOST(const char* path) {
  // Reuse bodyBuf: caller must have already filled it with JSON.
  // We need the host — copy it into a small local (it's only ~40 chars).
  char host[48];
  strcpy_P(host, API_HOST);

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

  int bodyLen = strlen(bodyBuf);
  sim808.print(F("AT+HTTPDATA="));
  sim808.print(bodyLen);
  sim808.println(F(",5000"));
  delay(1000); clearBuffer();

  sim808.print(bodyBuf);
  delay(2000); clearBuffer();

  sim808.println(F("AT+HTTPACTION=1"));
  delay(6000);

  memset(statusBuf, 0, sizeof(statusBuf));
  int p = 0;
  unsigned long t = millis();
  while (millis() - t < 2000 && p < 39)
    if (sim808.available()) statusBuf[p++] = sim808.read();

  bool ok = (strstr(statusBuf, ",200,") != NULL || strstr(statusBuf, ",201,") != NULL);

  sim808.println(F("AT+HTTPTERM"));
  delay(300); clearBuffer();
  return ok;
}

// ============================================================
//  POLL TRIP
// ============================================================
void pollTrip() {
  Serial.println(F("[TRIP] Polling backend..."));

  char vehicleId[8];
  strcpy_P(vehicleId, VEHICLE_ID);

  char apiTrip[24];
  strcpy_P(apiTrip, API_TRIP);

  // path fits in bodyBuf temporarily before httpGET overwrites host into it —
  // but httpGET only writes to bodyBuf after we're done with path, so we use
  // a small local path buffer here.
  char path[48];
  snprintf(path, sizeof(path), "%s?vehicleId=%s", apiTrip, vehicleId);

  if (!httpGET(path)) {
    Serial.println(F("[TRIP] No active trip."));
    tripActive   = false;
    contactCount = 0;
    tripId[0]    = '\0';
    return;
  }

  // ── Parse tripId ──────────────────────────────────────────
  char* tidPtr = strstr(respBuf, "\"tripId\":\"");
  if (tidPtr) {
    tidPtr += 10;
    int i = 0;
    while (*tidPtr && *tidPtr != '"' && i < 36)
      tripId[i++] = *tidPtr++;
    tripId[i] = '\0';
  }

  // ── Parse contacts (phoneNumber objects) ──────────────────
  contactCount = 0;
  char* cursor = respBuf;
  while (contactCount < 5) {
    char* phonePtr = strstr(cursor, "\"phoneNumber\":\"");
    if (!phonePtr) break;
    phonePtr += 15;
    int i = 0;
    while (*phonePtr && *phonePtr != '"' && i < 15)
      contacts[contactCount][i++] = *phonePtr++;
    contacts[contactCount][i] = '\0';
    if (i > 0) contactCount++;
    cursor = phonePtr;
  }

  // Fallback: bare string array  ["contacts":["+234..."]}
  if (contactCount == 0) {
    char* arr = strstr(respBuf, "\"contacts\":[");
    if (arr) {
      arr += 12;
      while (*arr && *arr != ']' && contactCount < 5) {
        while (*arr && *arr != '"' && *arr != ']') arr++;
        if (*arr != '"') break;
        arr++;
        int i = 0;
        while (*arr && *arr != '"' && i < 15)
          contacts[contactCount][i++] = *arr++;
        contacts[contactCount][i] = '\0';
        if (i > 0) contactCount++;
        if (*arr == '"') arr++;
      }
    }
  }

  tripActive = (tripId[0] != '\0' && contactCount > 0);

  Serial.print(F("[TRIP] Active: "));
  Serial.print(tripId);
  Serial.print(F(" | Contacts: "));
  Serial.println(contactCount);
}

// ============================================================
//  BUILD LOCATION JSON into bodyBuf  (shared by postGPS/postSOS)
// ============================================================
static void buildLocationBody(const char* vehicleId) {
  snprintf(bodyBuf, sizeof(bodyBuf),
    "{\"vehicleId\":\"%s\",\"tripId\":\"%s\","
    "\"lat\":%s,\"lng\":%s,"
    "\"date\":\"%s\",\"time\":\"%s\"}",
    vehicleId, tripId, latBuf, lonBuf, dateBuf, timeBuf);
}

// ============================================================
//  POST GPS
// ============================================================
void postGPS() {
  char vehicleId[8]; strcpy_P(vehicleId, VEHICLE_ID);
  char apiGps[20];   strcpy_P(apiGps,   API_GPS);

  buildLocationBody(vehicleId);

  Serial.println(F("[GPS] Posting location..."));
  Serial.println(httpPOST(apiGps) ? F("[GPS] Posted OK.") : F("[GPS] Post failed."));
}

// ============================================================
//  POST SOS EVENT
// ============================================================
void postSOS() {
  char vehicleId[8]; strcpy_P(vehicleId, VEHICLE_ID);
  char apiSos[20];   strcpy_P(apiSos,   API_SOS);

  buildLocationBody(vehicleId);

  Serial.println(F("[SOS] Posting SOS event to backend..."));
  Serial.println(httpPOST(apiSos) ? F("[SOS] Backend notified OK.") : F("[SOS] Backend post failed."));
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

  postSOS();
}

// ============================================================
//  GPS PARSER
// ============================================================
bool readAndParseGPS() {
  // Reuse respBuf for the raw NMEA response
  memset(respBuf, 0, sizeof(respBuf));
  int pos = 0;
  unsigned long t = millis();
  while (millis() - t < 400 && pos < (int)sizeof(respBuf) - 1)
    if (sim808.available()) respBuf[pos++] = sim808.read();

  char* p = strstr(respBuf, "+CGNSINF:");
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
  if (fields[1][0] != '1') return false;

  char* rawDT = fields[2];
  if (strlen(rawDT) < 14) return false;

  strncpy(latBuf, fields[3], sizeof(latBuf) - 1);
  strncpy(lonBuf, fields[4], sizeof(lonBuf) - 1);
  for (int i = 0; i < (int)sizeof(lonBuf); i++) {
    if (lonBuf[i] != '.' && (lonBuf[i] < '0' || lonBuf[i] > '9') &&
        lonBuf[i] != '-' && lonBuf[i] != 0) {
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
//  SMS — with location
// ============================================================
void sendSOS_SMS() {
  sim808.println(F("AT+CMGF=1"));
  delay(500); showModuleResponse();

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

  if (contactCount == 0)
    Serial.println(F("  No contacts loaded — no SMS sent."));

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
void clearBuffer()      { while (sim808.available()) sim808.read(); }
void showModuleResponse(){ while (sim808.available()) Serial.write(sim808.read()); }
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
      initGPRS();
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
