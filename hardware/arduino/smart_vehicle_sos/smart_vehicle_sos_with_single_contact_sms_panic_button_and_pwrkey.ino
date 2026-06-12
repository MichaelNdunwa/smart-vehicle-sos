#include <SoftwareSerial.h>

SoftwareSerial sim808(2, 3); // RX=D2 (Phys 4), TX=D3 (Phys 5)

// Hardware Pin Definitions (Schematic-Verified)
const int PIN_PWRKEY = 4;    // ATmega phys pin 6 (PD4) → Connected to SIM808 PWRKEY
const int PIN_PANIC  = 8;    // ATmega phys pin 14 (PB0) → Panic Button switch to GND

// Destination phone number configuration
const String TARGET_PHONE = "+2348130341656"; // Tule's number

// Non-blocking Timing State Variables
unsigned long lastGpsRequestTime = 0;
unsigned long buttonPressedTime = 0;
bool panicArmed = false;
bool smsSent = false;

// Global Cache Buffers for current location info
String currentLat  = "NO_FIX_YET";
String currentLon  = "NO_FIX_YET";
String currentDate = "00/00/2026";
String currentTime = "00:00:00";
String lastRawStream = "Initializing stream parameters...";

void setup() {
  // 1. Initialize control pins
  pinMode(PIN_PANIC, INPUT_PULLUP); // Uses internal pull-up resistor
  
  Serial.begin(115200);
  sim808.begin(9600);
  
  Serial.println("=== Smart Vehicle SOS Tracker (Full Dashboard Mode) ===");

  // 2. Automated SIM808 Negative-Switch Boot Sequence
  Serial.println("[SYS] Simulating manual Power Button press for 3 seconds...");
  pinMode(PIN_PWRKEY, OUTPUT);
  digitalWrite(PIN_PWRKEY, LOW);  // Direct short to GND to "press" button
  
  delay(3000);                    // Hold down for 3 seconds
  
  pinMode(PIN_PWRKEY, INPUT);     // Switch to INPUT to safely "release" button
  Serial.println("[SYS] Button released. Giving SIM808 5 seconds to stabilize...");
  
  delay(5000); // Wait for bootloader to finish loading and search for cell towers
  clearBuffer();

  // Power on the GNSS/GPS engine
  sim808.println("AT+CGNSPWR=1");
  delay(1000);
  clearBuffer();

  Serial.println("System Ready. Monitoring satellite stream and button layout state...");
  Serial.println("-----------------------------------------------------");
}

void loop() {
  // 1. DYNAMIC TICKER CHECK: Read panic button state instantly every loop cycle
  checkPanicButton();

  // 2. NON-BLOCKING TIMER: Request GPS data string strictly once every 5 seconds
  if (millis() - lastGpsRequestTime >= 5000) {
    sim808.println("AT+CGNSINF"); 
    lastGpsRequestTime = millis();
    
    // Only display background sync tracking stats if the user isn't actively pushing the panic button
    if (!panicArmed && currentLat == "NO_FIX_YET") {
      Serial.println("\n👉 STATUS: Synchronizing with GNSS data stream...");
      Serial.print("Raw Stream: ");
      Serial.println(lastRawStream);
      Serial.println("-----------------------------------------------------");
    }
  }
  
  // 3. Process incoming hardware serial bytes dynamically
  if (sim808.available()) {
    processGPSData();
  }

  delay(100); // Fast cycle rate ensures smooth button hold calculations
}

void clearBuffer() {
  while (sim808.available()) {
    sim808.read();
  }
}

void checkPanicButton() {
  bool buttonIsPressed = (digitalRead(PIN_PANIC) == LOW);

  if (buttonIsPressed) {
    if (!panicArmed) {
      // Pin transitions from floating to Ground (just pressed)
      buttonPressedTime = millis();
      panicArmed = true;
      Serial.println("\n[PANIC] Button held — counting validation matrix...");
    } else {
      // Pin is being actively held down
      unsigned long heldDuration = millis() - buttonPressedTime;
      unsigned long secondsElapsed = heldDuration / 1000;
      
      // Visual Progress Ticker: Prints exactly once per second change boundary
      static unsigned long lastPrintSecond = 0;
      if (secondsElapsed != lastPrintSecond && secondsElapsed <= 10) {
        Serial.print("[HOLDING] "); 
        Serial.print(secondsElapsed); 
        Serial.println("/10 seconds elapsed.");
        lastPrintSecond = secondsElapsed;
      }

      // Check if button validation window threshold has cleared
      if (heldDuration >= 10000) { 
        if (!smsSent) {
          Serial.println("\n[SUCCESS] 10 Second Security Threshold Crossed!");
          sendSOS_SMS(currentDate, currentTime, currentLat, currentLon);
          smsSent = true; // Block code execution from repeating continuous loop transmissions
        }
      }
    }
  } else {
    // Pin returns high (button released)
    if (panicArmed) {
      Serial.println("[PANIC] Released early — validation cancelled.");
      panicArmed = false;
      smsSent = false; // Instantly re-arm flag parameters for your next test run
    }
  }
}

void sendSOS_SMS(String date, String time, String lat, String lon) {
  Serial.println("\n[!] Triggering Test SMS Transmission...");
  
  // 1. Set SMS to Text Mode
  sim808.println("AT+CMGF=1");
  delay(500);
  showModuleResponse();
  
  // 2. Pass destination mobile number
  sim808.print("AT+CMGS=\"");
  sim808.print(TARGET_PHONE);
  sim808.println("\"");
  delay(500);
  showModuleResponse();
  
  // 3. Construct the text message payload
  sim808.println("EMERGENCY ALERT!");
  if (lat == "NO_FIX_YET") {
    sim808.print("Panic Button Verification: PASS!\n");
    sim808.print("GPS Status: Still searching for satellite lock.\n");
  } else {
    sim808.print("Vehicle Location Locked.\n");
  }
  sim808.print("Date: "); sim808.println(date);
  sim808.print("Local Time (WAT): "); sim808.println(time);
  sim808.print("Map Link: https://maps.google.com/?q=");
  sim808.print(lat);
  sim808.print(",");
  sim808.println(lon);
  
  delay(500);
  
  // 4. Send Ctrl+Z (ASCII 26) to tell the module to broadcast the message
  sim808.write(26); 
  
  Serial.println("SMS submitted to network. Waiting for confirmation code...");
  delay(5000); 
  showModuleResponse();
}

void showModuleResponse() {
  while (sim808.available()) {
    Serial.write(sim808.read());
  }
}

void processGPSData() {
  String response = "";
  while (sim808.available()) {
    char c = sim808.read();
    response += c;
  }
  
  // Cache the response to print on fallback loops if a lock isn't active yet
  response.trim();
  if (response.indexOf("AT+CGNSINF") == -1 && response.length() > 5) {
    lastRawStream = response;
  }
  
  int targetIndex = response.indexOf("+CGNSINF: 1,1");
  
  if (targetIndex >= 0) {
    String cleanData = response.substring(targetIndex);
    cleanData.trim();
    
    char dateTimeBuf[24] = {0};
    char latBuf[16] = {0};
    char lonBuf[16] = {0};
    
    int parsed = sscanf(cleanData.c_str(), "+CGNSINF: 1,1,%[^,],%[^,],%[^,]", dateTimeBuf, latBuf, lonBuf);
    
    if (parsed >= 3) {
      String rawDateTime = String(dateTimeBuf);
      currentLat         = String(latBuf);
      currentLon         = String(lonBuf);
      
      // Parse Date/Time structures
      String year   = rawDateTime.substring(0, 4);
      String month  = rawDateTime.substring(4, 6);
      String day    = rawDateTime.substring(6, 8);
      String hourStr = rawDateTime.substring(8, 10);
      String minute = rawDateTime.substring(10, 12);
      String second = rawDateTime.substring(12, 14);
      
      // Apply local timezone shift (WAT = UTC + 1)
      int localHour = hourStr.toInt() + 1;
      if (localHour >= 24) localHour -= 24;
      String formattedHour = String(localHour);
      if (localHour < 10) formattedHour = "0" + formattedHour;
      
      currentDate = day + "/" + month + "/" + year;
      currentTime = formattedHour + ":" + minute + ":" + second;
      
      // Only display the fully locked satellite dashboard if the button isn't being pressed down
      if (!panicArmed) {
        Serial.println("\n👉 STATUS: LOCATION LOCKED!");
        Serial.print("Date: "); Serial.println(currentDate);
        Serial.print("Local Time (WAT): "); Serial.println(currentTime);
        Serial.print("Google Maps Link: ");
        Serial.print("https://maps.google.com/?q=");
        Serial.print(currentLat); Serial.print(","); Serial.println(currentLon);
        Serial.println("-----------------------------------------------------");
      }
    }
  }
}