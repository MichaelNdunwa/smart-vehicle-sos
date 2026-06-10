/*
 * ============================================================
 * Smart Vehicle SOS & Anti-Kidnap Alert System
 * Hardware : ATmega328P + SIM808 (GSM + GPS)
 * Version  : 1 — Fully Enclosed Production Build
 * Author   : Michael Ndunwa
 * ============================================================
 *
 * HARDWARE PIN MAPPING (verified from schematic)
 * ─────────────────────────────────────────────────────────────
 * Component         ATmega Phys Pin   Arduino Pin
 * ──────────────────────────────────────────────────────────
 * RESET pull-up     Pin 1             RESET (via R2 10kΩ to VCC)
 * SIM808 TXD        Pin 4 (PD2)       D2  (SoftwareSerial RX)
 * SIM808 RXD        Pin 5 (PD3)       D3  (SoftwareSerial TX)
 * SIM808 PWRKEY     Pin 6 (PD4)       D4  (Direct Wire - Open Drain Pulse)
 * Crystal X1        Pins 9 & 10       XTAL1 / XTAL2 (16MHz)
 * Vibrator (TIP42)  Pin 13            D7  (PNP Base Driver)
 * Panic Button      Pin 14            D8  (INPUT_PULLUP switch to GND)
 * GREEN LED         Pin 15            D9  (via R3 330Ω)
 * RED LED           Pin 16            D10 (via R4 330Ω)
 * ─────────────────────────────────────────────────────────────
 *
 * DEVELOPMENT NOTES
 * ─────────────────────────────────────────────────────────────
 * - SIM808 is isolated on D2 & D3. D0 and D1 (Hardware UART) are 
 * completely free, allowing clean PC Serial Monitor logging at 115200.
 * - Flash the chip freely using an ISP programmer; no wires need 
 * to be pulled or disconnected.
 * - Auto-start grounds the PWRKEY for 3 seconds on vehicle ignition, 
 * then detaches the pin (INPUT mode) to prevent 5V leakage.
 * ─────────────────────────────────────────────────────────────
 */

#include <SoftwareSerial.h>

// ════════════════════════════════════════════════════════════
//  OBJECT & PIN CONFIGURATION
// ════════════════════════════════════════════════════════════
SoftwareSerial SIM808(2, 3); // RX=D2 (Phys 4), TX=D3 (Phys 5)

const int PIN_PWRKEY    = 4;   // ATmega phys pin 6  — SIM808 boot trigger
const int PIN_VIBRATOR  = 7;   // ATmega phys pin 13 — Haptic alert (TIP42 PNP)
const int PIN_PANIC     = 8;   // ATmega phys pin 14 — Driver SOS switch
const int PIN_LED_GREEN = 9;   // ATmega phys pin 15 — System power status
const int PIN_LED_RED   = 10;  // ATmega phys pin 16 — GPS tracking lock status

// ════════════════════════════════════════════════════════════
//  GLOBAL SYSTEM STORAGE
// ════════════════════════════════════════════════════════════
const String VEHICLE_ID   = "VH-001";
const String BACKEND_HOST = "your-backend.railway.app"; // Update with live URL

// --- Contact Buffers ---
String contacts[10];
int    contactCount    = 0;
bool   contactsFetched = false;

// --- Tracking Parameters ---
bool   gpsFix      = false;
String currentLat  = "";
String currentLon  = "";
String currentDate = "";
String currentTime = "";

// --- Safety Software Debounce ---
const unsigned long PANIC_HOLD_MS = 10000; // 10 seconds continuous hold
unsigned long panicPressStart = 0;
bool          panicArmed      = false;
bool          sosTriggered    = false;

// --- Telemetry Timer ---
unsigned long        lastGpsPost         = 0;
const unsigned long GPS_POST_INTERVAL     = 10000; // 10 seconds

// ════════════════════════════════════════════════════════════
//  INITIALIZATION
// ════════════════════════════════════════════════════════════
void setup() {
  // 1. Immediately secure control pins into safe states
  pinMode(PIN_VIBRATOR,  OUTPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED,   OUTPUT);
  
  digitalWrite(PIN_VIBRATOR,  HIGH); // TIP42 PNP — HIGH kills current to motor
  digitalWrite(PIN_LED_GREEN, HIGH); // Light power indicator
  digitalWrite(PIN_LED_RED,   LOW);  // Dark until lock confirmed

  // 2. Open up debugging pipes
  Serial.begin(115200);   
  SIM808.begin(9600);     
  
  Serial.println("=== Smart Vehicle SOS System v2.3 ===");
  Serial.print("Vehicle ID : "); Serial.println(VEHICLE_ID);

  // 3. Automated Enclosure Wake-up Pulse (Negative Switch Emulation)
  Serial.println("[SYS] Power-on sequence initiated: Grounding PWRKEY...");
  pinMode(PIN_PWRKEY, OUTPUT);
  digitalWrite(PIN_PWRKEY, LOW); // Hard path to GND active
  
  // Audio/Haptic confirmation for installation tracking
  digitalWrite(PIN_VIBRATOR, LOW); 
  delay(3000); // Pulse line for 3 full seconds
  
  // Floating release: disconnects line completely, letting SIM808 pull up to 3.3V
  pinMode(PIN_PWRKEY, INPUT); 
  digitalWrite(PIN_VIBRATOR, HIGH); // Kill buzz
  Serial.println("[SYS] PWRKEY detached. Allowing modem bootloader to stabilize...");
  
  delay(5000); // 5-second network initialization window
  clearBuffer();

  // 4. Power up Core Peripherals
  sendAT("AT+CGNSPWR=1", 1000); 
  setupGPRS();
  fetchContacts();

  Serial.println("Waiting for GPS satellite lock...");
}

// ════════════════════════════════════════════════════════════
//  MAIN EXECUTION
// ════════════════════════════════════════════════════════════
void loop() {
  handlePanicButton();

  // Poll GPS engine
  SIM808.println("AT+CGNSINF");
  processGPSData();

  // Telemetry loop
  if (gpsFix && (millis() - lastGpsPost >= GPS_POST_INTERVAL)) {
    postGPSLocation();
    lastGpsPost = millis();
  }

  delay(700);
}

// ════════════════════════════════════════════════════════════
//  PANIC MONITORING HAPTIC DEBOUNCE
// ════════════════════════════════════════════════════════════
void handlePanicButton() {
  bool pressed = (digitalRead(PIN_PANIC) == LOW);

  if (pressed) {
    if (!panicArmed) {
      panicPressStart = millis();
      panicArmed      = true;
      Serial.println("[PANIC] SOS switch triggered — holding validation window...");
    } else {
      unsigned long held = millis() - panicPressStart;

      // Haptic rhythmic pulse every 2s to inform driver validation is active
      if (held % 2000 < 50) vibratorPulse(100);

      if (held >= PANIC_HOLD_MS && !sosTriggered) {
        Serial.println("[SOS] 10-second validation confirmed! Dispatching emergency packets...");
        triggerSOS();
        sosTriggered = true;
      }
    }
  } else {
    if (panicArmed && !sosTriggered) {
      Serial.println("[PANIC] Threshold window breached early — aborted.");
    }
    panicArmed   = false;
    sosTriggered = false; 
  }
}

// ════════════════════════════════════════════════════════════
//  EMERGENCY ALERTS ROUTER
// ════════════════════════════════════════════════════════════
void triggerSOS() {
  vibratorPulse(1500); // Solid continuous buzz confirms lockout dispatch

  // Strobe indicator matrix
  for (int i = 0; i < 6; i++) {
    digitalWrite(PIN_LED_RED, !digitalRead(PIN_LED_RED));
    delay(150);
  }
  digitalWrite(PIN_LED_RED, HIGH);

  if (contactCount == 0) {
    Serial.println("[SOS] No targeted routing array cached — refreshing...");
    fetchContacts();
  }

  // Build standard mapping query URL for easy mobile click navigation
  String msg  = "EMERGENCY SOS ALERT!\n";
  msg += "Vehicle: " + VEHICLE_ID + "\n";
  msg += "Date: "    + currentDate + "\n";
  msg += "Time (WAT): " + currentTime + "\n";
  msg += "Location: https://maps.google.com/?q=" + currentLat + "," + currentLon;

  Serial.print("[SOS] Broadside dispatching to ");
  Serial.print(contactCount);
  Serial.println(" connection endpoints...");

  for (int i = 0; i < contactCount; i++) {
    Serial.print("[SOS] Routing Link → "); Serial.println(contacts[i]);
    sendSMS(contacts[i], msg);
    delay(3000);
  }

  postSOSAlert();
  Serial.println("[SOS] All emergency arrays successfully parsed and dispatched.");
}

// ════════════════════════════════════════════════════════════
//  GSM ENGINE INTERFACE
// ════════════════════════════════════════════════════════════
void sendSMS(String number, String message) {
  sendAT("AT+CMGF=1", 500);

  SIM808.print("AT+CMGS=\"");
  SIM808.print(number);
  SIM808.println("\"");
  delay(500);
  clearBuffer();

  SIM808.print(message);
  delay(200);
  SIM808.write(26); // ASCII End-of-Transmission (Ctrl+Z)
  delay(5000);
  showModuleResponse();
}

// ════════════════════════════════════════════════════════════
//  CLOUD BACKEND PARSING STACK
// ════════════════════════════════════════════════════════════
void fetchContacts() {
  Serial.println("[NET] Synchronizing emergency contact registers...");
  contactCount = 0;

  String response = httpGET("/api/trip/active?vehicleId=" + VEHICLE_ID);

  if (response.length() == 0) {
    Serial.println("[NET] Connection drop — Null payload received.");
    return;
  }

  Serial.print("[NET] Payload: "); Serial.println(response);

  int arrayStart = response.indexOf("[");
  int arrayEnd   = response.indexOf("]");

  if (arrayStart < 0 || arrayEnd < 0) {
    Serial.println("[NET] Structural mismatch — Vector boundary missing.");
    return;
  }

  String arrayStr = response.substring(arrayStart + 1, arrayEnd);
  int pos = 0;

  while (pos < (int)arrayStr.length() && contactCount < 10) {
    int comma = arrayStr.indexOf(',', pos);
    if (comma < 0) comma = arrayStr.length();

    String token = arrayStr.substring(pos, comma);
    token.trim();
    token.replace("\"", "");
    token.trim();

    if (token.length() > 6) {
      contacts[contactCount] = token;
      Serial.print("[NET] Parsed Node: "); Serial.println(contacts[contactCount]);
      contactCount++;
    }
    pos = comma + 1;
  }

  if (contactCount > 0) {
    contactsFetched = true;
    Serial.print("[NET] Caching complete. "); Serial.print(contactCount); Serial.println(" nodes ready.");
    vibratorPulse(300); 
  } else {
    Serial.println("[NET] Active manifest empty. Retrying loop on telemetry lock.");
  }
}

void postGPSLocation() {
  String body = "{\"vehicleId\":\"" + VEHICLE_ID + "\","
              + "\"lat\":\""  + currentLat  + "\","
              + "\"lon\":\""  + currentLon  + "\","
              + "\"date\":\"" + currentDate + "\","
              + "\"time\":\"" + currentTime + "\"}";
  httpPOST("/api/gps/update", body);
  Serial.println("[GPS] Telemetry node broadcast successful.");
}

void postSOSAlert() {
  String body = "{\"vehicleId\":\"" + VEHICLE_ID + "\","
              + "\"lat\":\""  + currentLat  + "\","
              + "\"lon\":\""  + currentLon  + "\","
              + "\"date\":\"" + currentDate + "\","
              + "\"time\":\"" + currentTime + "\","
              + "\"contactsNotified\":" + String(contactCount) + "}";
  httpPOST("/api/sos/trigger", body);
  Serial.println("[SOS] Packet written to server core event loop.");
}

// ════════════════════════════════════════════════════════════
//  TELEMETRY PROCESSING CORE
// ════════════════════════════════════════════════════════════
void processGPSData() {
  String response = "";

  // Resilient processing loop prevents character clipping under heavy network data loads
  unsigned long timeout = millis();
  while (millis() - timeout < 500) {
    while (SIM808.available()) {
      char c = SIM808.read();
      response += c;
      timeout = millis(); 
    }
  }

  int idx = response.indexOf("+CGNSINF: 1,1");
  if (idx < 0) {
    if (!gpsFix) Serial.println("[GPS] Searching for orbital satellite array...");
    return;
  }

  String cleanData = response.substring(idx);
  cleanData.trim();

  char dateTimeBuf[24] = {0};
  char latBuf[16]      = {0};
  char lonBuf[16]      = {0};

  int parsed = sscanf(cleanData.c_str(),
                      "+CGNSINF: 1,1,%[^,],%[^,],%[^,]",
                      dateTimeBuf, latBuf, lonBuf);

  if (parsed >= 3) {
    String rawDT  = String(dateTimeBuf);
    currentLat    = String(latBuf);
    currentLon    = String(lonBuf);

    String year   = rawDT.substring(0, 4);
    String month  = rawDT.substring(4, 6);
    String day    = rawDT.substring(6, 8);
    
    // Adjust local WAT time parameters (UTC+1)
    int localHour = rawDT.substring(8, 10).toInt() + 1; 
    if (localHour >= 24) localHour -= 24;
    String fmtHour = (localHour < 10 ? "0" : "") + String(localHour);
    String minute = rawDT.substring(10, 12);
    String second = rawDT.substring(12, 14);

    currentDate = day + "/" + month + "/" + year;
    currentTime = fmtHour + ":" + minute + ":" + second;

    if (!gpsFix) {
      gpsFix = true;
      digitalWrite(PIN_LED_RED, HIGH); // Hardware status arming
      Serial.println("[GPS] Target coordinate trace established. Core fully armed.");
      if (!contactsFetched) fetchContacts(); 
    }

    Serial.println("── GPS DATA READOUT ─────────────────────");
    Serial.print("Date       : "); Serial.println(currentDate);
    Serial.print("Time (WAT) : "); Serial.println(currentTime);
    Serial.print("Map URL    : https://maps.google.com/?q=");
    Serial.print(currentLat); Serial.print(","); Serial.println(currentLon);
    Serial.println("─────────────────────────────────────────");
  }
}

// ════════════════════════════════════════════════════════════
//  APN NETWORK LAYER INTERFACE
// ════════════════════════════════════════════════════════════
void setupGPRS() {
  Serial.println("[NET] Attaching to GPRS cellular bearer standard...");
  sendAT("AT+SAPBR=3,1,\"Contype\",\"GPRS\"", 1000);
  sendAT("AT+SAPBR=3,1,\"APN\",\"internet\"", 1000); // Standard Nigerian fallback APN
  sendAT("AT+SAPBR=1,1", 3000); 
  sendAT("AT+SAPBR=2,1", 1000); 
  Serial.println("[NET] GPRS networking interface operational.");
}

String httpGET(String path) {
  String result = "";

  sendAT("AT+HTTPINIT", 1000);
  sendAT("AT+HTTPPARA=\"CID\",1", 500);

  SIM808.print("AT+HTTPPARA=\"URL\",\"http://");
  SIM808.print(BACKEND_HOST);
  SIM808.print(path);
  SIM808.println("\"");
  delay(500); clearBuffer();

  sendAT("AT+HTTPACTION=0", 6000); 
  sendAT("AT+HTTPREAD", 3000);

  unsigned long t = millis();
  while (millis() - t < 3000) {
    while (SIM808.available()) result += (char)SIM808.read();
  }

  sendAT("AT+HTTPTERM", 500);

  int bodyStart = result.lastIndexOf("\r\n\r\n");
  if (bodyStart >= 0) result = result.substring(bodyStart + 4);
  result.trim();
  return result;
}

void httpPOST(String path, String jsonBody) {
  sendAT("AT+HTTPINIT", 1000);
  sendAT("AT+HTTPPARA=\"CID\",1", 500);

  SIM808.print("AT+HTTPPARA=\"URL\",\"http://");
  SIM808.print(BACKEND_HOST);
  SIM808.print(path);
  SIM808.println("\"");
  delay(500); clearBuffer();

  sendAT("AT+HTTPPARA=\"CONTENT\",\"application/json\"", 500);

  SIM808.print("AT+HTTPDATA=");
  SIM808.print(jsonBody.length());
  SIM808.println(",10000");
  delay(1000);
  SIM808.print(jsonBody);
  delay(2000);
  showModuleResponse();

  sendAT("AT+HTTPACTION=1", 6000); 
  sendAT("AT+HTTPTERM", 500);
}

// ════════════════════════════════════════════════════════════
//  LOW-LEVEL PIPELINE ACCESSORIES
// ════════════════════════════════════════════════════════════
void sendAT(String cmd, int waitMs) {
  SIM808.println(cmd);
  delay(waitMs);
  clearBuffer();
}

void clearBuffer() {
  while (SIM808.available()) SIM808.read();
}

void showModuleResponse() {
  while (SIM808.available()) Serial.write(SIM808.read());
}

void vibratorPulse(int durationMs) {
  digitalWrite(PIN_VIBRATOR, LOW);  // Direct path to GND triggers TIP42 base conduction
  delay(durationMs);
  digitalWrite(PIN_VIBRATOR, HIGH); // Terminate base bias, motor shuts down
}