// TOILET TROUBLE — Hot & Cold NYC
// Prototype data only. Replace SAMPLE_RESTROOMS with a cleaned, static NYC Open Data dataset.

const SAMPLE_RESTROOMS = [
  { id: 1, name: "Sample Facility A", lat: 40.7308, lng: -73.9973, operational: true, accessible: true },
  { id: 2, name: "Sample Facility B", lat: 40.7359, lng: -73.9911, operational: true, accessible: true },
  { id: 3, name: "Sample Facility C", lat: 40.7248, lng: -73.9997, operational: true, accessible: false },
  { id: 4, name: "Sample Facility D", lat: 40.7412, lng: -73.9897, operational: true, accessible: true },
  { id: 5, name: "Sample Facility E", lat: 40.7282, lng: -73.9846, operational: false, accessible: true },
  { id: 6, name: "Sample Facility F", lat: 40.7187, lng: -73.9960, operational: true, accessible: true },
  { id: 7, name: "Sample Facility G", lat: 40.7440, lng: -73.9992, operational: true, accessible: false },
  { id: 8, name: "Sample Facility H", lat: 40.7384, lng: -73.9822, operational: true, accessible: true }
];

const CONFIG = {
  winRadiusMeters: 45,
  searchZoneRadiusMeters: 1500,
  defaultStepMeters: 25,
  destination: { name: "Union Square", lat: 40.7359, lng: -73.9911 }
};

const $ = (id) => document.getElementById(id);
const timerEl = $("timer");
const guessCountEl = $("guess-count");
const scoreEl = $("score");
const temperatureWordEl = $("temperature-word");
const feedbackEl = $("feedback");
const heatFillEl = $("heat-fill");
const distanceReadoutEl = $("distance-readout");
const restartButton = $("restart-button");
const mapStatusEl = $("map-status");
const coordinatesEl = $("coordinates");
const resultOverlay = $("result-overlay");
const directionArrow = $("direction-arrow");
const directionLabel = $("direction-label");
const directionDetail = $("direction-detail");
const movementInstructions = $("movement-instructions");
const gameMusic = $("game-music");
const introOverlay = $("intro-overlay");
const beginButton = $("begin-button");

let map;
let latestGuessPoint = null;
let guessMarker = null;
let guessPath = null;
let guessPoints = [];
let guessCount = 0;
let score = 0;
let gameOver = false;
let elapsedSeconds = 0;
let timerInterval = null;
let previousDistance = null;
let destinationMarker;
let searchZone;

const qualifyingRestrooms = SAMPLE_RESTROOMS.filter(r => r.operational && r.accessible);

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([CONFIG.destination.lat, CONFIG.destination.lng], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
  }).addTo(map);

  searchZone = L.circle([CONFIG.destination.lat, CONFIG.destination.lng], {
    radius: CONFIG.searchZoneRadiusMeters,
    color: "#111111", weight: 2, dashArray: "7 7",
    fillColor: "#000000", fillOpacity: 0.04, interactive: false
  }).addTo(map);

  destinationMarker = L.marker([CONFIG.destination.lat, CONFIG.destination.lng], {
    icon: L.divIcon({
      className: "",
      html: '<div style="background:#ffffff;color:#111111;border:2px solid #111111;padding:5px 7px;font:10px monospace;white-space:nowrap;box-shadow:3px 3px 0 #0004">UNION SQUARE</div>',
      iconSize: [105, 28], iconAnchor: [52, 14]
    }), interactive: false
  }).addTo(map);

  // Map clicks are reserved for normal map interaction. The player starts at a random location.
  map.on("click", () => {
    if (!gameOver && latestGuessPoint) {
      setTemperature("USE WASD", "Move with W, A, S, and D. Each press moves 25 meters; arrow keys pan the map.", 0);
    }
  });
}

function getRandomStartingPoint() {
  // Sample uniformly by area inside the circular search zone, avoiding an instant win.
  const radius = CONFIG.searchZoneRadiusMeters;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(latToRad(CONFIG.destination.lat));

  for (let attempt = 0; attempt < 300; attempt++) {
    const distance = Math.sqrt(Math.random()) * radius;
    const angle = Math.random() * Math.PI * 2;
    const point = {
      lat: CONFIG.destination.lat + (Math.sin(angle) * distance) / metersPerDegreeLat,
      lng: CONFIG.destination.lng + (Math.cos(angle) * distance) / metersPerDegreeLng
    };
    const nearest = nearestQualifyingRestroom(point);
    if (nearest && nearest.distance > CONFIG.winRadiusMeters * 2) return point;
  }

  // Fallback should be extremely rare; still stay within the search circle.
  return {
    lat: CONFIG.destination.lat + 0.004,
    lng: CONFIG.destination.lng - 0.006
  };
}

function placePlayerAt(point) {
  latestGuessPoint = point;
  guessPoints = [point];
  guessMarker = L.marker([point.lat, point.lng], {
    icon: L.divIcon({ className: "", html: '<div class="guess-marker latest"></div>', iconSize: [22,22], iconAnchor: [11,11] }),
    keyboard: false
  }).addTo(map);
  guessMarker.bindTooltip("YOUR LOCATION", { direction: "top", offset: [0, -9] });
  guessPath = L.polyline([[point.lat, point.lng]], { color: "#111111", weight: 3, opacity: 0.8, dashArray: "4 7" }).addTo(map);
}

function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function isInsideSearchZone(point) {
  return distanceMeters(point, CONFIG.destination) <= CONFIG.searchZoneRadiusMeters;
}

function nearestQualifyingRestroom(point) {
  if (!qualifyingRestrooms.length) return null;
  return qualifyingRestrooms.map(restroom => ({
    restroom,
    distance: distanceMeters(point, restroom)
  })).sort((a, b) => a.distance - b.distance)[0];
}

// Moves by a fixed number of meters in the chosen cardinal direction.
function movePlayer(direction) {
  if (gameOver || !latestGuessPoint) {
    if (!gameOver) setTemperature("BEGIN SEARCH", "Press BEGIN SEARCH to spawn at a random location.", 0);
    return;
  }

  const step = CONFIG.defaultStepMeters;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(latToRad(latestGuessPoint.lat));
  const next = { ...latestGuessPoint };

  if (direction === "up") next.lat += step / metersPerDegreeLat;
  if (direction === "down") next.lat -= step / metersPerDegreeLat;
  if (direction === "right") next.lng += step / metersPerDegreeLng;
  if (direction === "left") next.lng -= step / metersPerDegreeLng;

  if (!isInsideSearchZone(next)) {
    setTemperature("ZONE EDGE", "You reached the edge of the search area. Try moving another direction.", 0);
    mapStatusEl.textContent = "SEARCH ZONE EDGE";
    return;
  }

  latestGuessPoint = next;
  guessCount += 1;
  guessPoints.push(next);
  guessMarker.setLatLng([next.lat, next.lng]);
  guessPath.setLatLngs(guessPoints.map(p => [p.lat, p.lng]));
  guessMarker.setTooltipContent(`YOUR LOCATION · STEP ${String(guessCount).padStart(2, "0")}`);
  evaluatePosition(false);
  mapStatusEl.textContent = `POSITION UPDATED · STEP ${String(guessCount).padStart(2, "0")}`;
}

function latToRad(degrees) { return degrees * Math.PI / 180; }

function evaluatePosition(isFirstPosition) {
  const nearest = nearestQualifyingRestroom(latestGuessPoint);
  if (!nearest) {
    setTemperature("NO TARGETS", "No sample facilities currently match this mission.", 0);
    return;
  }

  const distance = nearest.distance;
  updateDirectionIndicator(latestGuessPoint, nearest.restroom, distance);
  coordinatesEl.textContent = `LAT ${latestGuessPoint.lat.toFixed(4)} / LNG ${latestGuessPoint.lng.toFixed(4)}`;
  distanceReadoutEl.textContent = formatDistance(distance);

  if (distance <= CONFIG.winRadiusMeters) {
    score = Math.max(100, 1000 - guessCount * 15 - elapsedSeconds * 2);
    updateStats();
    setTemperature("BULLSEYE!", "You reached a qualifying location in the demo dataset!", 100);
    mapStatusEl.textContent = "QUALIFYING LOCATION FOUND";
    endGame(true);
    return;
  }

  let word, message, heat;
  if (isFirstPosition) {
    if (distance < 250) [word, message, heat] = ["SCORCHING", "Your starting point is very close to a qualifying facility. Follow the compass.", 92];
    else if (distance < 500) [word, message, heat] = ["HOT", "You're within a few city blocks. Follow the compass toward the nearest target.", 72];
    else if (distance < 850) [word, message, heat] = ["WARM", "You're in the neighborhood. Use the direction indicator to navigate.", 48];
    else [word, message, heat] = ["COLD", "The nearest target is farther away. Follow the compass and keep exploring.", 20];
  } else {
    const change = previousDistance - distance;
    if (change > 8) [word, message, heat] = ["HOTTER!", "You're getting closer to a qualifying restroom.", Math.min(98, 60 + change / 5)];
    else if (change < -8) [word, message, heat] = ["COLDER", "You moved farther from the nearest qualifying restroom. Check the compass.", 20];
    else [word, message, heat] = ["SAME TEMP", "You're about the same distance away. Try another direction.", 42];
  }
  previousDistance = distance;
  setTemperature(word, message, heat);
  updateStats();
}

function updateDirectionIndicator(from, target, distance) {
  const lat1 = latToRad(from.lat), lat2 = latToRad(target.lat);
  const dLng = latToRad(target.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  directionArrow.style.transform = `rotate(${bearing}deg)`;
  const directions = ["NORTH", "NORTH-EAST", "EAST", "SOUTH-EAST", "SOUTH", "SOUTH-WEST", "WEST", "NORTH-WEST"];
  const index = Math.round(bearing / 45) % 8;
  directionLabel.textContent = `HEAD ${directions[index]}`;
  directionDetail.textContent = `${formatDistance(distance)} to nearest qualifying target`;
}

function setTemperature(word, message, heatPercent) {
  temperatureWordEl.textContent = word;
  feedbackEl.textContent = message;
  heatFillEl.style.width = `${Math.max(0, Math.min(100, heatPercent))}%`;
  temperatureWordEl.style.color = "#111111";
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "N/A";
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function updateStats() {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  timerEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  guessCountEl.textContent = String(guessCount).padStart(2, "0");
  scoreEl.textContent = String(score).padStart(4, "0");
}

function startRound() {
  if (timerInterval || gameOver) return;
  if (gameMusic) {
    gameMusic.currentTime = 0;
    gameMusic.volume = 0.65;
    const playback = gameMusic.play();
    if (playback && typeof playback.catch === "function") playback.catch(() => {});
  }
  startStopwatch();
}

function startStopwatch() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (gameOver) return;
    elapsedSeconds += 1;
    updateStats();
  }, 1000);
}

function endGame(won) {
  if (gameOver) return;
  gameOver = true;
  clearInterval(timerInterval);
  timerInterval = null;
  if (gameMusic) { gameMusic.pause(); gameMusic.currentTime = 0; }
  resultOverlay.classList.remove("hidden");
  $("result-stamp").textContent = won ? "WIN" : "TT";
  $("result-stamp").style.background = "#fff";
  $("result-eyebrow").textContent = won ? "MISSION COMPLETE" : "SEARCH PAUSED";
  $("result-title").textContent = won ? "YOU FOUND IT!" : "SEARCH PAUSED";
  $("result-copy").textContent = `You explored for ${formatElapsed(elapsedSeconds)} and made ${guessCount} moves.`;
  $("final-score").textContent = String(score).padStart(4, "0");
}

function formatElapsed(total) {
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

function resetGame() {
  clearInterval(timerInterval);
  timerInterval = null;
  if (gameMusic) { gameMusic.pause(); gameMusic.currentTime = 0; }
  elapsedSeconds = 0;
  guessCount = 0;
  score = 0;
  gameOver = false;
  previousDistance = null;
  latestGuessPoint = null;
  guessPoints = [];
  if (guessMarker) { map.removeLayer(guessMarker); guessMarker = null; }
  if (guessPath) { map.removeLayer(guessPath); guessPath = null; }
  resultOverlay.classList.add("hidden");
  introOverlay.classList.remove("hidden");
  distanceReadoutEl.textContent = "—";
  coordinatesEl.textContent = "LAT — / LNG —";
  mapStatusEl.textContent = "AWAITING RANDOM SPAWN";
  directionArrow.style.transform = "rotate(0deg)";
  directionLabel.textContent = "DIRECTION UNKNOWN";
  directionDetail.textContent = "Your compass points toward the nearest target.";
  movementInstructions.textContent = "Press Begin Search to spawn at a random location. Use W, A, S, and D to move 25 meters at a time. Arrow keys pan the map.";
  setTemperature("READY?", "Press Begin Search to start at a random location.", 0);
  updateStats();
  map.setView([CONFIG.destination.lat, CONFIG.destination.lng], 15);
}


document.addEventListener("keydown", event => {
  if (event.target.matches("input, textarea, select")) return;
  const key = event.key.toLowerCase();
  const directions = { w: "up", s: "down", a: "left", d: "right" };
  if (directions[key]) {
    event.preventDefault();
    movePlayer(directions[key]);
  }
});

restartButton.addEventListener("click", resetGame);
$("play-again-button").addEventListener("click", resetGame);
beginButton.addEventListener("click", () => {
  introOverlay.classList.add("hidden");
  map.invalidateSize();
  const startPoint = getRandomStartingPoint();
  placePlayerAt(startPoint);
  startRound();
  evaluatePosition(true);
  movementInstructions.textContent = "You spawned at a random location. Use W, A, S, and D to move 25 meters at a time. Arrow keys pan the map.";
  mapStatusEl.textContent = "SEARCH STARTED — RANDOM SPAWN";
});
initMap();
resetGame();
