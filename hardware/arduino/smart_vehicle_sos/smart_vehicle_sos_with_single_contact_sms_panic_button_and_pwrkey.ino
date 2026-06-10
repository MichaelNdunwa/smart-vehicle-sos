#include <SoftwareSerial.h>

SoftwareSerial sim808(2, 3); // RX=D2 (Phys 4), TX=D3 (Phys 5)

// Hardware Pin Definitions (Schematic-Verified)
const int PIN_PWRKEY = 4;    // ATmega phys pin 6 (PD4) → Connected to SIM808 PWRKEY
const int PIN_PANIC  = 8;    // ATmega phys pin 14 (PB0) → Panic Button switch to GND

// Destination phone number configuration
const String TARGET_PHONE = "+2348130341656"; // Tule's number
// const String TARGET_PHONE = "+2348168313095"; // My bro's number
bool smsSent = false; // Flag to ensure it only sends ONE test SMS

void setup() {
  // 1. Initialize control pins
  pinMode(PIN_PANIC, INPUT_PULLUP); // Uses internal pull-up resistor
  
  Serial.begin(115200);
  sim808.begin(9600);
  
  Serial.println("=== Smart Vehicle SOS Tracker (SMS Test Mode) ===");

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

  Serial.println("System Ready. HOLD Panic Button (D8) down to trigger SMS transmission test...");
  Serial.println("-----------------------------------------------------");
}

void loop() {
  // Request GPS data
  sim808.println("AT+CGNSINF"); 
  delay(300); 
  
  processGPSData();
  delay(4700); 
}

void clearBuffer() {
  while (sim808.available()) {
    sim808.read();
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
  sim808.print("Vehicle Location Locked.\n");
  sim808.print("Date: "); sim808.println(date);
  sim808.print("Local Time: "); sim808.println(time);
  sim808.print("Map Link: https://maps.google.com/?q=");
  sim808.print(lat);
  sim808.print(",");
  sim808.println(lon);
  
  delay(500);
  
  // 4. Send Ctrl+Z (ASCII 26) to tell the module to broadcast the message
  sim808.write(26); 
  
  Serial.println("SMS submitted to network. Waiting for confirmation code...");
  delay(5000); // Give the module plenty of time to transmit
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
      String latitude    = String(latBuf);
      String longitude   = String(lonBuf);
      
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
      
      String cleanDate = day + "/" + month + "/" + year;
      String cleanTime = formattedHour + ":" + minute + ":" + second;
      
      // Print Dashboard Status
      Serial.println("\n👉 STATUS: LOCATION LOCKED!");
      Serial.print("Date: "); Serial.println(cleanDate);
      Serial.print("Local Time (WAT): "); Serial.println(cleanTime);
      Serial.print("Google Maps Link: ");
      Serial.print("https://maps.google.com/?q=");
      Serial.print(latitude); Serial.print(","); Serial.println(longitude);
      Serial.println("-----------------------------------------------------");
      
      // Check if the Panic Button is being pressed (LOW) to execute SMS test
      if (digitalRead(PIN_PANIC) == LOW) {
        if (!smsSent) {
          sendSOS_SMS(cleanDate, cleanTime, latitude, longitude);
          smsSent = true; // Prevents sending continuous loop texts
        }
      } else {
        // If they released the button, re-arm the flag so they can test it again
        if (smsSent) {
          Serial.println("[SYS] Button released. Rearming test trigger flag...");
          smsSent = false;
        }
      }
      return; 
    }
  }
  
  Serial.println("\n👉 STATUS: Synchronizing with GNSS data stream...");
  Serial.print("Raw Stream: ");
  Serial.println(response);
  Serial.println("-----------------------------------------------------");
}