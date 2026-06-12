#include <SoftwareSerial.h>

SoftwareSerial sim808(2, 3); // RX, TX

// ── Pin & Config ────────────────────────────────────────────
const int    PIN_PWRKEY = 4; // ATmega phys pin 6 (PD4) → Connected to SIM808 PWRKEY → Arduino D4
const int    PIN_PANIC    = 8; // ATmega phys pin 14 (PB0) → Panic Button switch to GND → Arduino D8
const int    PIN_VIBRATOR = 7; // ATmega phys pin 13 (PD7) → Haptic Alert (TIP42 PNP) → Arduino D7
const int    PIN_LED_GREEN = 9; // ATmega phys pin 15 (PB1) → System Power Indicator → Arduino D9
const char   TARGET_PHONE[] PROGMEM = "+2347079370548";

// ── Panic state ─────────────────────────────────────────────
const unsigned long PANIC_HOLD_MS = 10000UL;
unsigned long panicPressStart     = 0;
unsigned long lastCountSec        = 0xFFFFFFFFUL;
bool panicArmed                   = false;
bool panicSMSSent                 = false;

// ── Reusable char buffers (no heap String churn) ────────────
char  latBuf[12];
char  lonBuf[12];
char  dateBuf[12];
char  timeBuf[10];

// ============================================================
void setup() {
  Serial.begin(9600);           // 9600 saves ~200 bytes vs 115200
  pinMode(PIN_PANIC, INPUT_PULLUP);
  pinMode(PIN_VIBRATOR, OUTPUT);
  digitalWrite(PIN_VIBRATOR, HIGH); // ensure motor off at boot

  pinMode(PIN_LED_GREEN, OUTPUT);
  digitalWrite(PIN_LED_GREEN, LOW); // LED off until SIM808 confirmed on

  Serial.println(F("=== SOS Tracker ==="));

  // Boot SIM808 before any AT commands
  sim808.begin(9600);
  powerOnSIM808();         // ← auto power-on

  delay(1000);
  sim808.println(F("AT+CGNSPWR=1"));
  delay(1000);
  clearBuffer();
  Serial.println(F("GPS acquiring lock..."));
  Serial.println(F("--------------------------"));
}

// ============================================================
//  MAIN LOOP
// ============================================================
void loop() {
  checkPanicButton();

  // Only run GPS poll when panic button is NOT held
  if (!panicArmed) {
    sim808.println(F("AT+CGNSINF"));
    delay(300);
    processGPSData();

    // Break the 4700ms delay into 100ms slices so panic button
    // stays responsive throughout the full GPS cycle
    for (int i = 0; i < 47; i++) {
      delay(100);
      checkPanicButton();
    }
  } else {
    // While armed, skip GPS poll entirely — just check button rapidly
    delay(100);
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

      // Progress bar
      Serial.print(F("  ["));
      for (int i = 0; i < 10; i++)
        Serial.print(i < (int)heldSec ? '|' : '.');
      Serial.print(F("] "));

      if (remaining > 0) {
        Serial.print(remaining);
        Serial.println(F("s left"));
      } else {
        Serial.println(F("SENDING!"));
      }
    }

    if (heldMs >= PANIC_HOLD_MS && !panicSMSSent) {
      panicSMSSent = true;
      Serial.println(F("\n>> 10s confirmed. Fetching GPS..."));
      triggerPanicSMS();
    }

  } else {
    if (panicArmed) {
      if (!panicSMSSent)
        Serial.println(F("[PANIC] Released early - cancelled."));
      panicArmed = false;
    }
  }
}

// ============================================================
//  PANIC → GPS → SMS
// ============================================================
void triggerPanicSMS() {
  bool gotFix = false;

  for (int attempt = 0; attempt < 3 && !gotFix; attempt++) {
    Serial.print(F("  GPS attempt "));
    Serial.print(attempt + 1);
    Serial.println(F("/3..."));
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
}

// ============================================================
//  GPS PARSER — writes into global char buffers
//  Returns true on valid fix
// ============================================================
bool readAndParseGPS() {
  // Read raw response into a static buffer (no heap String)
  static char buf[120];
  memset(buf, 0, sizeof(buf));
  int pos = 0;
  unsigned long t = millis();
  while (millis() - t < 400 && pos < 119) {
    if (sim808.available())
      buf[pos++] = sim808.read();
  }

  // Find "+CGNSINF:" in the buffer
  char* p = strstr(buf, "+CGNSINF:");
  if (!p) return false;

  // Tokenise by comma — we need fields 0-4
  // Field 0: run status, 1: fix status, 2: datetime, 3: lat, 4: lon
  char* tok = strtok(p + 9, ",");   // skip "+CGNSINF:"
  char* fields[5] = {0};
  int   fi = 0;
  while (tok && fi < 5) {
    // trim leading space
    while (*tok == ' ') tok++;
    fields[fi++] = tok;
    tok = strtok(NULL, ",");
  }

  if (fi < 5) return false;
  if (fields[1][0] != '1') return false;   // no fix

  char* rawDT = fields[2];  // "20260612233855.000"
  if (strlen(rawDT) < 14)  return false;

  // Lat / Lon
  strncpy(latBuf, fields[3], sizeof(latBuf) - 1);
  strncpy(lonBuf, fields[4], sizeof(lonBuf) - 1);
  // strip any trailing non-numeric chars from lon
  for (int i = 0; i < (int)sizeof(lonBuf); i++) {
    if (lonBuf[i] != '.' && (lonBuf[i] < '0' || lonBuf[i] > '9') && lonBuf[i] != '-' && lonBuf[i] != 0) {
      lonBuf[i] = 0; break;
    }
  }

  // Parse datetime
  int yearInt  = (rawDT[0]-'0')*1000 + (rawDT[1]-'0')*100 + (rawDT[2]-'0')*10 + (rawDT[3]-'0');
  int monthInt = (rawDT[4]-'0')*10   + (rawDT[5]-'0');
  int dayInt   = (rawDT[6]-'0')*10   + (rawDT[7]-'0');
  int rawHour  = (rawDT[8]-'0')*10   + (rawDT[9]-'0');
  int minInt   = (rawDT[10]-'0')*10  + (rawDT[11]-'0');
  int secInt   = (rawDT[12]-'0')*10  + (rawDT[13]-'0');

  // WAT = UTC+1, carry date if needed
  int localHour = rawHour + 1;
  if (localHour >= 24) {
    localHour = 0;
    dayInt++;
    const byte dim[] = { 0,31,28,31,30,31,30,31,31,30,31,30,31 };
    int maxDay = dim[monthInt];
    if (monthInt == 2 && ((yearInt%4==0 && yearInt%100!=0) || yearInt%400==0))
      maxDay = 29;
    if (dayInt > maxDay) {
      dayInt = 1; monthInt++;
      if (monthInt > 12) { monthInt = 1; yearInt++; }
    }
  }

  // Format into fixed char buffers  DD/MM/YYYY  and  HH:MM:SS
  snprintf(dateBuf, sizeof(dateBuf), "%02d/%02d/%04d", dayInt, monthInt, yearInt);
  snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d:%02d", localHour, minInt, secInt);

  return true;
}

// ============================================================
//  GPS LOOP DISPLAY
// ============================================================
void processGPSData() {
  bool got = readAndParseGPS();

  // Suppress location output while panic button is being held
  if (panicArmed) return;

  if (got) {
    Serial.println(F("\n>> LOCATION LOCKED"));
    Serial.print(F("   Date: "));       Serial.println(dateBuf);
    Serial.print(F("   Time (WAT): ")); Serial.println(timeBuf);
    Serial.print(F("   Maps: https://www.google.com/maps?q="));
    Serial.print(latBuf); Serial.print(','); Serial.println(lonBuf);
  } else {
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

  sim808.print(F("AT+CMGS=\""));
  // TARGET_PHONE is in PROGMEM — copy to stack to send
  char phone[20];
  strcpy_P(phone, TARGET_PHONE);
  sim808.print(phone);
  sim808.println('"');
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

  vibrateConfirm(1500); // haptic confirm before banner

  Serial.println(F("\n+---------------------------+"));
  Serial.println(F("|  SOS SMS SENT OK          |"));
  Serial.print(F("|  To: "));
  Serial.println(phone);
  Serial.println(F("|  Release the panic button |"));
  Serial.println(F("+---------------------------+\n"));
}

// ============================================================
//  SMS — no GPS fix
// ============================================================
void sendSOS_NoFix() {
  sim808.println(F("AT+CMGF=1"));
  delay(500); showModuleResponse();

  sim808.print(F("AT+CMGS=\""));
  char phone[20];
  strcpy_P(phone, TARGET_PHONE);
  sim808.print(phone);
  sim808.println('"');
  delay(500); showModuleResponse();

  sim808.println(F("EMERGENCY ALERT!"));
  sim808.println(F("Panic triggered. No GPS fix."));
  sim808.println(F("Locate vehicle immediately."));

  delay(500);
  sim808.write(26);
  delay(5000);
  showModuleResponse();

  vibrateConfirm(1500); // haptic confirm before banner

  Serial.println(F("\n+---------------------------+"));
  Serial.println(F("|  SOS SENT (no GPS fix)    |"));
  Serial.println(F("|  Release the panic button |"));
  Serial.println(F("+---------------------------+\n"));
}

// ============================================================
//  UTILITIES
// ============================================================
void clearBuffer() {
  while (sim808.available()) sim808.read();
}

void showModuleResponse() {
  while (sim808.available()) Serial.write(sim808.read());
}

// ============================================================
//  HAPTIC FEEDBACK  – 3 short pulses to confirm SOS sent
// ============================================================
void vibrateConfirm(int durationMs) {
  digitalWrite(PIN_VIBRATOR, LOW);  // Motor Runs
  delay(durationMs);
  digitalWrite(PIN_VIBRATOR, HIGH); // Motor Stops
}

// ============================================================
//  SIM808 AUTO POWER-ON
//  Mimics a 2.5s PWRKEY button hold to boot the module.
//  Safe to call even if module is already on — it checks
//  for an AT response first before attempting the key press.
// ============================================================
void powerOnSIM808() {
  Serial.println(F("Checking SIM808 state..."));

  // Probe first — if it responds it's already on
  sim808.println(F("AT"));
  delay(500);
  if (sim808.available()) {
    Serial.println(F("SIM808 already on. OK"));
    clearBuffer();
    digitalWrite(PIN_LED_GREEN, HIGH); // LED on — SIM808 confirmed on
    return;
  }

  // Pull PWRKEY LOW for 2.5s to boot
  Serial.println(F("Powering on SIM808..."));
  pinMode(PIN_PWRKEY, OUTPUT);
  digitalWrite(PIN_PWRKEY, HIGH); // ensure idle first
  delay(200);
  digitalWrite(PIN_PWRKEY, LOW);  // hold to trigger boot
  delay(2500);
  digitalWrite(PIN_PWRKEY, HIGH); // release

  // Wait up to 10s for module to finish booting
  Serial.print(F("Waiting for boot"));
  unsigned long start = millis();
  while (millis() - start < 10000) {
    sim808.println(F("AT"));
    delay(500);
    if (sim808.available()) {
      clearBuffer();
      Serial.println(F(" OK"));
      Serial.println(F("SIM808 is on."));
      digitalWrite(PIN_LED_GREEN, HIGH); // LED on — SIM808 confirmed on
      return;
    }
    Serial.print('.');
  }

  // ── Module never responded ──────────────────────────────
  // Halt everything and instruct the user — no point running
  // GPS polls or waiting for a panic press with no modem.
  Serial.println();
  Serial.println(F("╔══════════════════════════════════╗"));
  Serial.println(F("║      ⚠  SIM808 NOT FOUND         ║"));
  Serial.println(F("╠══════════════════════════════════╣"));
  Serial.println(F("║  Module did not respond after    ║"));
  Serial.println(F("║  auto power-on attempt.          ║"));
  Serial.println(F("║                                  ║"));
  Serial.println(F("║  Please check:                   ║"));
  Serial.println(F("║  1. SIM808 power supply (4V)     ║"));
  Serial.println(F("║  2. PWRKEY wiring on D4          ║"));
  Serial.println(F("║  3. Try powering on manually     ║"));
  Serial.println(F("║                                  ║"));
  Serial.println(F("║  Reset Arduino once SIM808 is    ║"));
  Serial.println(F("║  confirmed powered on.           ║"));
  Serial.println(F("╚══════════════════════════════════╝"));

  // Blink vibrator as physical alert — 5 long pulses
  for (int i = 0; i < 5; i++) {
    digitalWrite(PIN_VIBRATOR, LOW);
    delay(500);
    digitalWrite(PIN_VIBRATOR, HIGH);
    delay(300);
  }

  // Hard halt — nothing runs until Arduino is reset
  while (true) { delay(1000); }
}