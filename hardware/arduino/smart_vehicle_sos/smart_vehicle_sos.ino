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

// ── Shared global buffers ───────────────────────────────────
static char statusBuf[80];
static char respBuf[300];
static char bodyBuf[165];

// ── Trip / contact state ────────────────────────────────────
char  tripId[37]      = "";
char  contacts[5][16] = {};   
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
bool panicTriggered               = false; // Signals HTTP to abort

// ── GPS buffers ─────────────────────────────────────────────
char latBuf[12];
char lonBuf[12];
char dateBuf[12];
char timeBuf[10];

// ============================================================
//  NON-BLOCKING "SMART DELAY"
//  Waits for MS, but continuously checks the panic button.
//  Returns TRUE if a panic was triggered, signaling an abort.
// ============================================================
bool smartDelay(unsigned long ms) {
  unsigned long start = millis();
  while (millis() - start < ms) {
    checkPanicButton();
    if (panicTriggered) return true; // Abort ongoing operation
  }
  return false;
}

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

  smartDelay(1000);
  sim808.println(F("AT+CGNSPWR=1"));
  smartDelay(1000);
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

  // If a 10-second hold just completed, take over the sequence
  if (panicTriggered) {
    panicTriggered = false; // Reset flag
    Serial.println(F("\n>> 10s confirmed. Aborting routine tasks to send SOS..."));
    
    // Clean up any HTTP session that got cut off mid-way
    sim808.println(F("AT+HTTPTERM"));
    delay(300); clearBuffer(); 
    
    triggerPanicSMS();
  }

  // Normal Operations (Only run if button isn't currently being held down)
  if (!panicArmed) {
    powerOffCheck();

    sim808.println(F("AT+CGNSINF"));
    if (smartDelay(300)) return; // Bail out if panic pressed while waiting
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

    // A brief non-blocking wait to pace the loop
    smartDelay(1500); 
  }
}

// ============================================================
//  GPRS INIT (Robust Version)
// ============================================================
void initGPRS() {
  Serial.println(F("\n[GPRS] Initialising Network..."));

  // 1. Check SIM Readiness (Patiently wait up to 15 seconds)
  Serial.print(F("[GPRS] Waiting for SIM card"));
  bool simReady = false;
  for (int i = 0; i < 15; i++) {
    if (panicTriggered) return; // Exit if panic button pressed
    
    sim808.println(F("AT+CPIN?"));
    smartDelay(500);
    memset(respBuf, 0, sizeof(respBuf));
    int p = 0; while(sim808.available() && p < sizeof(respBuf)-1) respBuf[p++] = sim808.read();
    
    if (strstr(respBuf, "READY")) {
      simReady = true;
      break;
    }
    Serial.print('.');
    smartDelay(1000);
  }
  
  if (!simReady) {
    Serial.println(F(" FAIL!"));
    Serial.println(F("[WARN] Could not read SIM. Is it inserted correctly?"));
    return;
  }
  Serial.println(F(" OK"));

  // 2. Wait for Cellular Registration (CREG)
  Serial.print(F("[GPRS] Waiting for cell tower"));
  bool registered = false;
  for (int i = 0; i < 20; i++) {
    if (panicTriggered) return; 
    
    sim808.println(F("AT+CREG?"));
    smartDelay(500);
    memset(respBuf, 0, sizeof(respBuf));
    int p = 0; while(sim808.available() && p < sizeof(respBuf)-1) respBuf[p++] = sim808.read();
    
    if (strstr(respBuf, ",1") || strstr(respBuf, ",5")) {
      registered = true;
      break;
    }
    Serial.print('.');
    smartDelay(2000);
  }
  if (!registered) { Serial.println(F(" FAIL")); return; }
  Serial.println(F(" OK"));

  // 3. Open Bearer (Try up to 3 times)
  strcpy_P(bodyBuf, APN);
  bool bearerOpen = false;

  for (int attempt = 1; attempt <= 3; attempt++) {
    if (panicTriggered) return;
    Serial.print(F("[GPRS] Bearer attempt ")); Serial.println(attempt);

    // Force close any stuck previous session
    sim808.println(F("AT+SAPBR=0,1"));
    smartDelay(1000); clearBuffer();

    // Ensure GPRS service is attached (CGATT)
    sim808.println(F("AT+CGATT?"));
    smartDelay(500);
    memset(respBuf, 0, sizeof(respBuf));
    int p = 0; while(sim808.available() && p < sizeof(respBuf)-1) respBuf[p++] = sim808.read();
    
    if (!strstr(respBuf, ": 1")) {
      Serial.println(F("       Attaching GPRS service..."));
      sim808.println(F("AT+CGATT=1"));
      smartDelay(4000); clearBuffer();
    }

    // Configure bearer
    sim808.println(F("AT+SAPBR=3,1,\"Contype\",\"GPRS\""));
    smartDelay(500); clearBuffer();

    sim808.print(F("AT+SAPBR=3,1,\"APN\",\""));
    sim808.print(bodyBuf);
    sim808.println('"');
    smartDelay(500); clearBuffer();

    // Open bearer
    sim808.println(F("AT+SAPBR=1,1"));
    smartDelay(3000); clearBuffer();

    // Verify bearer is open and got an IP address
    sim808.println(F("AT+SAPBR=2,1"));
    smartDelay(500);
    memset(respBuf, 0, sizeof(respBuf));
    p = 0; while(sim808.available() && p < sizeof(respBuf)-1) respBuf[p++] = sim808.read();

    if (strstr(respBuf, ",1,")) {
      bearerOpen = true;
      break;
    }
    
    Serial.println(F("       Failed. Retrying..."));
    smartDelay(2000);
  }

  if (bearerOpen) {
    Serial.println(F("[GPRS] READY."));
  } else {
    Serial.println(F("[GPRS] Failed to open bearer."));
  }
  Serial.println(F("--------------------------"));
}

// ============================================================
//  HTTP GET (Now fully non-blocking and abortable)
// ============================================================
bool httpGET(const char* path) {
  strcpy_P(bodyBuf, API_HOST);

  // 1. Terminate any stuck previous HTTP session
  sim808.println(F("AT+HTTPTERM"));
  smartDelay(300); clearBuffer();

  sim808.println(F("AT+HTTPINIT"));
  if (smartDelay(300)) return false; clearBuffer();

  sim808.println(F("AT+HTTPPARA=\"CID\",1"));
  if (smartDelay(200)) return false; clearBuffer();

  sim808.print(F("AT+HTTPPARA=\"URL\",\"http://"));
  sim808.print(bodyBuf);   // host
  sim808.print(path);
  sim808.println('"');
  if (smartDelay(300)) return false; clearBuffer();

  sim808.println(F("AT+HTTPACTION=0"));

  // 2. Actively wait for HTTPACTION URC (up to 20 seconds)
  memset(statusBuf, 0, sizeof(statusBuf));
  int p = 0;
  unsigned long t = millis();
  bool actionFound = false;

  while (millis() - t < 20000UL) {
    checkPanicButton();
    if (panicTriggered) return false;

    while (sim808.available() && p < sizeof(statusBuf) - 1) {
      statusBuf[p++] = sim808.read();
      statusBuf[p] = '\0';
    }
    
    if (strstr(statusBuf, "+HTTPACTION:")) {
      smartDelay(100); // Breathe to let the rest of the string arrive
      while (sim808.available() && p < sizeof(statusBuf) - 1) {
        statusBuf[p++] = sim808.read();
        statusBuf[p] = '\0';
      }
      actionFound = true;
      break;
    }
  }

  if (!actionFound) {
    Serial.println(F("  [HTTP] Timeout waiting for HTTPACTION"));
    sim808.println(F("AT+HTTPTERM"));
    smartDelay(300); clearBuffer();
    return false;
  }

  // Check HTTP code (200 OK)
  bool ok = (strstr(statusBuf, ",200,") != NULL);

  if (ok) {
    sim808.println(F("AT+HTTPREAD"));
    memset(respBuf, 0, sizeof(respBuf));
    int ri = 0;
    t = millis();
    // 3. Actively read the response payload until \r\nOK
    while (millis() - t < 5000 && ri < (int)sizeof(respBuf) - 1) {
      checkPanicButton();
      if (panicTriggered) return false;

      while (sim808.available() && ri < (int)sizeof(respBuf) - 1) {
        respBuf[ri++] = sim808.read();
        respBuf[ri] = '\0';
      }
      if (strstr(respBuf, "\r\nOK")) break;
    }
  } else {
    Serial.print(F("  [HTTP] Request failed. Response: "));
    Serial.println(statusBuf);
  }

  sim808.println(F("AT+HTTPTERM"));
  smartDelay(300); clearBuffer();
  return ok;
}

// ============================================================
//  HTTP POST (Now fully non-blocking and abortable)
// ============================================================
bool httpPOST(const char* path) {
  char host[48];
  strcpy_P(host, API_HOST);

  // 1. Terminate any stuck previous HTTP session
  sim808.println(F("AT+HTTPTERM"));
  smartDelay(300); clearBuffer();

  sim808.println(F("AT+HTTPINIT"));
  if (smartDelay(300)) return false; clearBuffer();

  sim808.println(F("AT+HTTPPARA=\"CID\",1"));
  if (smartDelay(200)) return false; clearBuffer();

  sim808.print(F("AT+HTTPPARA=\"URL\",\"http://"));
  sim808.print(host);
  sim808.print(path);
  sim808.println('"');
  if (smartDelay(300)) return false; clearBuffer();

  sim808.println(F("AT+HTTPPARA=\"CONTENT\",\"application/json\""));
  if (smartDelay(200)) return false; clearBuffer();

  int bodyLen = strlen(bodyBuf);
  sim808.print(F("AT+HTTPDATA="));
  sim808.print(bodyLen);
  sim808.println(F(",5000"));
  if (smartDelay(1000)) return false; clearBuffer();

  sim808.print(bodyBuf);
  if (smartDelay(2000)) return false; clearBuffer();

  sim808.println(F("AT+HTTPACTION=1"));

  memset(statusBuf, 0, sizeof(statusBuf));
  int p = 0;
  unsigned long t = millis();
  bool actionFound = false;

  // 2. Actively wait for HTTPACTION URC (up to 20 seconds)
  while (millis() - t < 20000UL) {
    checkPanicButton();
    if (panicTriggered) return false;

    while (sim808.available() && p < sizeof(statusBuf) - 1) {
      statusBuf[p++] = sim808.read();
      statusBuf[p] = '\0';
    }
    
    if (strstr(statusBuf, "+HTTPACTION:")) {
      smartDelay(100); 
      while (sim808.available() && p < sizeof(statusBuf) - 1) {
        statusBuf[p++] = sim808.read();
        statusBuf[p] = '\0';
      }
      actionFound = true;
      break;
    }
  }

  if (!actionFound) {
    Serial.println(F("  [POST] Timeout waiting for HTTPACTION"));
    sim808.println(F("AT+HTTPTERM"));
    smartDelay(300); clearBuffer();
    return false;
  }

  bool ok = (strstr(statusBuf, ",200,") != NULL || strstr(statusBuf, ",201,") != NULL);
  
  if (!ok) {
    Serial.print(F("  [POST] Failed. Response: "));
    Serial.println(statusBuf);
  }

  sim808.println(F("AT+HTTPTERM"));
  smartDelay(300); clearBuffer();
  return ok;
}

// ============================================================
//  POLL TRIP
// ============================================================
void pollTrip() {
  Serial.println(F("[TRIP] Polling backend..."));

  char vehicleId[8]; strcpy_P(vehicleId, VEHICLE_ID);
  char apiTrip[24];  strcpy_P(apiTrip, API_TRIP);
  char path[48];
  snprintf(path, sizeof(path), "%s?vehicleId=%s", apiTrip, vehicleId);

  if (!httpGET(path)) {
    if (panicTriggered) return; // Silent abort if interrupted
    Serial.println(F("[TRIP] No active trip."));
    tripActive   = false;
    contactCount = 0;
    tripId[0]    = '\0';
    return;
  }

  // Parse tripId
  char* tidPtr = strstr(respBuf, "\"tripId\":\"");
  if (tidPtr) {
    tidPtr += 10;
    int i = 0;
    while (*tidPtr && *tidPtr != '"' && i < 36)
      tripId[i++] = *tidPtr++;
    tripId[i] = '\0';
  }

  // Parse contacts
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

  tripActive = (tripId[0] != '\0' && contactCount > 0);
  Serial.print(F("[TRIP] Active: "));
  Serial.print(tripId);
  Serial.print(F(" | Contacts: "));
  Serial.println(contactCount);
}

// ============================================================
//  BUILD LOCATION JSON
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
  bool success = httpPOST(apiGps);
  if (!panicTriggered) {
    Serial.println(success ? F("[GPS] Posted OK.") : F("[GPS] Post failed."));
  }
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
//  PANIC BUTTON LOGIC
// ============================================================
void checkPanicButton() {
  bool buttonDown = (digitalRead(PIN_PANIC) == LOW);

  if (buttonDown) {
    // If we've already reached 10s and triggered the SMS, ignore further logic
    // until the user physically lets go of the button.
    if (panicSMSSent) return; 

    if (!panicArmed) {
      panicPressStart = millis();
      panicArmed      = true;
      panicSMSSent    = false;
      panicTriggered  = false;
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
      else                 Serial.println(F("SENDING!"));
    }

    if (heldMs >= PANIC_HOLD_MS && !panicSMSSent) {
      panicSMSSent = true;   // Ensures it only fires once per press
      panicTriggered = true; // Sets the flag to instantly abort ongoing HTTP tasks
    }

  } else {
    // Button released
    if (panicArmed) {
      if (!panicSMSSent) Serial.println(F("[PANIC] Released early - cancelled."));
      panicArmed = false;
      panicSMSSent = false;
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
    delay(600); // Standard delay is fine here, we are already in Panic Mode
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