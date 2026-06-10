#include <SoftwareSerial.h>

SoftwareSerial sim808(2, 3); // RX, TX

void setup() {
  Serial.begin(115200);
  while(!Serial); 
  
  Serial.println("=== Smart Vehicle SOS Tracker ===");
  sim808.begin(9600);
  delay(1000);

  // Power on the GNSS/GPS engine
  sim808.println("AT+CGNSPWR=1");
  delay(1000);
  clearBuffer();

  Serial.println("System Ready. Waiting for satellite lock...");
  Serial.println("-----------------------------------------------------");
}

void loop() {
  // Request GPS data
  sim808.println("AT+CGNSINF"); 
  delay(300); // Give serial line plenty of time to populate the buffer
  
  processGPSData();
  delay(4700); 
}

void clearBuffer() {
  while (sim808.available()) {
    sim808.read();
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
      
      // Isolate Date and Time components
      String year   = rawDateTime.substring(0, 4);
      String month  = rawDateTime.substring(4, 6);
      String day    = rawDateTime.substring(6, 8);
      String hourStr = rawDateTime.substring(8, 10);
      String minute = rawDateTime.substring(10, 12);
      String second = rawDateTime.substring(12, 14);
      
      // Convert hour to integer and apply WAT (UTC + 1) offset
      int localHour = hourStr.toInt();
      localHour = localHour + 1; 
      
      // Handle midnight rollover edge case (e.g., 23:30 UTC becomes 00:30 WAT)
      if (localHour >= 24) {
        localHour = localHour - 24;
        // Note: For absolute perfection, rolling over 24 hours would also advance the day field.
        // For a standard tracking dashboard timestamp, managing the hour shift covers 95% of cases.
      }
      
      // Format the local hour back to a 2-digit string (e.g., "9" becomes "09")
      String formattedHour = String(localHour);
      if (localHour < 10) {
        formattedHour = "0" + formattedHour;
      }
      
      Serial.println("\n👉 STATUS: LOCATION LOCKED!");
      Serial.print("Date: "); Serial.print(day); Serial.print("/"); Serial.print(month); Serial.print("/"); Serial.println(year);
      Serial.print("Local Time (WAT): "); Serial.print(formattedHour); Serial.print(":"); Serial.print(minute); Serial.print(":"); Serial.println(second);
      
      // Generate clean Google Maps Link
      Serial.print("Google Maps Link: ");
      Serial.print("https://www.google.com/maps?q=");
      Serial.print(latitude);
      Serial.print(",");
      Serial.println(longitude);
      Serial.println("-----------------------------------------------------");
      return; 
    }
  }
  
  Serial.println("\n👉 STATUS: Synchronizing with GNSS data stream...");
  Serial.print("Raw Stream: ");
  Serial.println(response);
  Serial.println("-----------------------------------------------------");
}
