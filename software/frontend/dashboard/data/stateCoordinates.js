const STATE_COORDINATES = {
  "Abia": [5.4527, 7.5248],
  "Adamawa": [9.3265, 12.3984],
  "Akwa Ibom": [5.0389, 7.9096],
  "Anambra": [6.2108, 6.9964],
  "Bauchi": [11.6222, 10.0705],
  "Bayelsa": [4.7719, 6.0699],
  "Benue": [7.7337, 8.5352],
  "Borno": [11.8333, 13.1500],
  "Cross River": [5.8702, 8.5988],
  "Delta": [5.5234, 5.7534],
  "Ebonyi": [6.2649, 8.0137],
  "Edo": [6.3524, 5.6037],
  "Ekiti": [7.7199, 5.3110],
  "Enugu": [6.4483, 7.5137],
  "FCT (Abuja)": [9.0765, 7.3986],
  "Gombe": [10.2797, 11.1723],
  "Imo": [5.4907, 7.0350],
  "Jigawa": [11.7587, 9.5610],
  "Kaduna": [10.5105, 7.4165],
  "Kano": [12.0022, 8.5920],
  "Katsina": [12.9902, 7.6018],
  "Kebbi": [11.4956, 4.5234],
  "Kogi": [7.7337, 6.6906],
  "Kwara": [8.4973, 4.5420],
  "Lagos": [6.5244, 3.3792],
  "Nasarawa": [8.5406, 7.7107],
  "Niger": [9.5833, 6.5500],
  "Ogun": [7.1609, 3.3486],
  "Ondo": [7.2567, 4.8382],
  "Osun": [7.7833, 4.5667],
  "Oyo": [7.3775, 3.9470],
  "Plateau": [9.8965, 8.8583],
  "Rivers": [4.8156, 7.0498],
  "Sokoto": [13.0059, 5.2476],
  "Taraba": [8.8833, 11.3667],
  "Yobe": [11.7480, 11.9660],
  "Zamfara": [12.1667, 6.2500]
};

const CITY_ALIASES = {
  "Abuja": "FCT (Abuja)",
  "Port Harcourt": "Rivers",
  "Ibadan": "Oyo",
  "Aba": "Abia",
  "Jos": "Plateau",
  "Maiduguri": "Borno",
  "Benin City": "Edo",
  "Warri": "Delta",
  "Kaduna City": "Kaduna"
};

function getCoordinates(name) {
  return STATE_COORDINATES[name] ?? STATE_COORDINATES[CITY_ALIASES[name]] ?? null;
}

export { getCoordinates };
export default STATE_COORDINATES;
