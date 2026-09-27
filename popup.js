const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- ASSETS ---
const rocketImg = new Image();
rocketImg.src = 'Rocket_Orbit-42.png';

const bgStarsImg = new Image();
// Updated to match your exact file name
bgStarsImg.src = 'Stars_Orbit-42.avif'; 

const moonImg = new Image();
moonImg.src = 'Moon_Orbit-42.png';

const earthImg = new Image();
earthImg.src = 'Earth_Orbit_42.png';

const marsImg = new Image();
marsImg.src = 'Mars_Orbit-42.png';

// --- GAME CONSTANTS ---
const WIDTH = 768;
const HEIGHT = 576;
const UNIVERSAL_G = 0.1; 

// Rigid Body Physics Parameters
const MASS = 1.0;
const ROCKET_L = 24; 
const ROCKET_W = 12; 
const INERTIA = ((1 / 12) * MASS * (ROCKET_W * ROCKET_W + ROCKET_L * ROCKET_L)) * 4; 
const RESTITUTION = 0.15; 
const FRICTION = 0.55;    
const MAX_SAFE_IMPACT = 2.4; 

const THRUST_POWER = 0.08; 
const RCS_TORQUE = 0.16;

// --- CELESTIAL BODY FACTORIES ---
const MOON_R = 40, MOON_SOI = 40 * 2.6, MOON_MASS = 1600;
const EARTH_R = 60, EARTH_SOI = MOON_SOI * 1.5, EARTH_MASS = MOON_MASS * 2;
const MARS_R = 100, MARS_SOI = MOON_SOI * 2.5, MARS_MASS = MOON_MASS * 4;

function createMoon(x, y) {
    return { 
        name: "Moon", x, y, radius: MOON_R, soiRadius: MOON_SOI, mass: MOON_MASS, 
        color: '#888', 
        soiBorder: 'rgba(200, 200, 200, 0.85)',
        soiFill: 'rgba(200, 200, 200, 0.10)' 
    };
}
function createEarth(x, y) {
    return { 
        name: "Earth", x, y, radius: EARTH_R, soiRadius: EARTH_SOI, mass: EARTH_MASS, 
        color: '#4ba3c3', 
        soiBorder: 'rgba(75, 163, 195, 0.85)',
        soiFill: 'rgba(75, 163, 195, 0.10)' 
    };
}
function createMars(x, y) {
    return { 
        name: "Mars", x, y, radius: MARS_R, soiRadius: MARS_SOI, mass: MARS_MASS, 
        color: '#d90429', 
        soiBorder: 'rgba(217, 4, 41, 0.85)',
        soiFill: 'rgba(217, 4, 41, 0.10)' 
    };
}

// 1.5x Larger Landing Zone Settings
const LANDING_ZONE_CONFIG = {
    width: 0.6,  
    radius: 30   
};

const cornersLocal = [
    { x: -ROCKET_L / 2, y: -ROCKET_W / 2 }, 
    { x:  ROCKET_L / 2, y: -ROCKET_W / 2 }, 
    { x:  ROCKET_L / 2, y:  ROCKET_W / 2 }, 
    { x: -ROCKET_L / 2, y:  ROCKET_W / 2 }  
];

// --- LOCAL STORAGE & PROGRESSION ---
let unlockedLevels = 10;
let bestTimes = {};
let endlessHighScore = 0;

try {
    bestTimes = JSON.parse(localStorage.getItem('orbit42_times')) || {};
    endlessHighScore = parseInt(localStorage.getItem('orbit42_endless_high')) || 0;
} catch (e) {
    console.warn("LocalStorage unavailable:", e);
}

function saveProgress() {
    try {
        localStorage.setItem('orbit42_unlocked', unlockedLevels);
        localStorage.setItem('orbit42_times', JSON.stringify(bestTimes));
        localStorage.setItem('orbit42_endless_high', endlessHighScore);
    } catch (e) {}
}

// --- WORLD 1 LEVEL DEFINITIONS ---
const LEVELS = [
    {
        bodies: [createMoon(384, 288)],
        start: { x: 384, y: 288 - MOON_R - 13, angle: -Math.PI / 2 },
        targetBody: 0, targetAngle: Math.PI / 2
    },
    {
        bodies: [createMoon(200, 288), createMoon(568, 288)],
        start: { x: 200 - MOON_R - 13, y: 288, angle: Math.PI },
        targetBody: 1, targetAngle: 0
    },
    {
        bodies: [createMoon(150, 150), createEarth(580, 380)],
        start: { x: 150, y: 150 - MOON_R - 13, angle: -Math.PI / 2 },
        targetBody: 1, targetAngle: Math.PI / 2
    },
    {
        bodies: [createEarth(180, 288), createEarth(588, 288)],
        start: { x: 180 - EARTH_R - 13, y: 288, angle: Math.PI },
        targetBody: 1, targetAngle: 0
    },
    {
        bodies: [createMoon(200, 180), createMars(550, 380)],
        start: { x: 200, y: 180 - MOON_R - 13, angle: -Math.PI / 2 },
        targetBody: 1, targetAngle: Math.PI / 2
    },
    {
        bodies: [createEarth(180, 288), createMars(550, 288)],
        start: { x: 180 - EARTH_R - 13, y: 288, angle: Math.PI },
        targetBody: 1, targetAngle: 0
    },
    {
        bodies: [createMoon(120, 120), createEarth(384, 288), createMars(720, 50)],
        start: { x: 120, y: 120 + MOON_R + 13, angle: Math.PI / 2 },
        targetBody: 2, targetAngle: (3 * Math.PI) / 4
    },
    {
        bodies: [createEarth(0, 288), createMars(384, 28), createMars(384, 548), createMoon(768, 288)],
        start: { x: EARTH_R + 13, y: 288, angle: 0 },
        targetBody: 3, targetAngle: Math.PI
    },
    {
        bodies: [createMars(0, 288), createMars(500, 288)],
        start: { x: MARS_R + 13, y: 288, angle: 0 },
        targetBody: 1, targetAngle: 0
    },
    {
        bodies: [createMars(0, 288), createMoon(384, 100), createMoon(384, 288), createMoon(384, 476), createMars(768, 288)],
        start: { x: MARS_R + 13, y: 288, angle: 0 },
        targetBody: 4, targetAngle: Math.PI
    }
];

// --- STATE VARIABLES ---
let currentLevelIdx = 0;
let currentBodies = [];
let targetLanding = { bodyIndex: 0, angle: 0 };

let visualTrajectory = []; 
let rocket = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, angularVelocity: 0 };
let keys = { a: false, d: false, s: false };
let startTime = 0;
let landingTimer = 0;
let touchdownTime = 0; 
let finalTime = 0;     
let lastTime = performance.now();

// Endless Mode Specifics
let endlessBodies = [];
let endlessScore = 0;
let cameraX = 0;
let nextPlanetX = 0;

let gameState = 'main_menu'; 

// --- INPUT HANDLING ---
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'a') keys.a = true;
    if (e.key.toLowerCase() === 'd') keys.d = true;
    if (e.key.toLowerCase() === 's') keys.s = true;
    
    if (e.key === ' ') {
        if (gameState === 'won' && currentLevelIdx + 1 < LEVELS.length) {
            startLevel(currentLevelIdx + 1);
        } else if (gameState === 'crashed') {
            startLevel(currentLevelIdx);
        } else if (gameState === 'endless_crashed') {
            startEndlessMode();
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'a') keys.a = false;
    if (e.key.toLowerCase() === 'd') keys.d = false;
    if (e.key.toLowerCase() === 's') keys.s = false;
});

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (gameState === 'main_menu') {
        if (mx > WIDTH - 130 && mx < WIDTH - 20 && my > 20 && my < 55) {
            gameState = 'settings';
        } else if (mx > 0 && mx < WIDTH / 2 && my > HEIGHT / 2 && my < HEIGHT) {
            gameState = 'level_select';
        } else if (mx > WIDTH / 2 && mx < WIDTH && my > HEIGHT / 2 && my < HEIGHT) {
            startEndlessMode();
        }
    } 
    else if (gameState === 'level_select') {
        if (mx > 20 && mx < 100 && my > 20 && my < 55) {
            gameState = 'main_menu';
        } else {
            const startX = 94, startY = 220, gapX = 116, gapY = 110;
            for (let i = 0; i < 10; i++) {
                let col = i % 5, row = Math.floor(i / 5);
                let bx = startX + col * gapX, by = startY + row * gapY;
                if (mx > bx && mx < bx + 80 && my > by && my < by + 80) {
                    if (i + 1 <= unlockedLevels) {
                        startLevel(i);
                    }
                }
            }
        }
    }
    else if (gameState === 'settings') {
        if (mx > 20 && mx < 100 && my > 20 && my < 55) {
            gameState = 'main_menu';
        }
    }
    else if (gameState.startsWith('endless')) {
        if (mx > 20 && mx < 100 && my > 20 && my < 55) {
            gameState = 'main_menu';
        }
    }
    else if (gameState === 'playing' || gameState === 'crashed' || gameState === 'won') {
        if (mx > 20 && mx < 100 && my > 20 && my < 55) {
            gameState = 'level_select';
        }
    }
});

// --- LEVEL & GAME INIT ---
function startLevel(idx) {
    currentLevelIdx = idx;
    const lvl = LEVELS[idx];
    currentBodies = lvl.bodies;
    targetLanding = { bodyIndex: lvl.targetBody, angle: lvl.targetAngle };
    
    rocket = {
        x: lvl.start.x,
        y: lvl.start.y,
        vx: 0, vy: 0,
        angle: lvl.start.angle,
        angularVelocity: 0
    };
    visualTrajectory = [];
    startTime = Date.now();
    landingTimer = 0;
    touchdownTime = 0;
    finalTime = 0;
    gameState = 'playing';
}

function startEndlessMode() {
    const startBoxWidth = WIDTH / 5;
    endlessBodies = [];
    endlessScore = 0;
    cameraX = 0;
    nextPlanetX = startBoxWidth + 384;

    rocket = {
        x: startBoxWidth + 12,
        y: HEIGHT / 2,
        vx: 0, vy: 0,
        angle: 0,
        angularVelocity: 0
    };
    visualTrajectory = [];
    gameState = 'endless_playing';
}

function generateEndlessPlanets() {
    while (nextPlanetX < cameraX + WIDTH + 500) {
        const rand = Math.random();
        let p;
        if (rand < 0.4) {
            const minY = MOON_R / 2, maxY = HEIGHT - MOON_R / 2;
            p = createMoon(nextPlanetX, minY + Math.random() * (maxY - minY));
        } else if (rand < 0.75) {
            const minY = EARTH_R / 2, maxY = HEIGHT - EARTH_R / 2;
            p = createEarth(nextPlanetX, minY + Math.random() * (maxY - minY));
        } else {
            const minY = MARS_R / 2, maxY = HEIGHT - MARS_R / 2;
            p = createMars(nextPlanetX, minY + Math.random() * (maxY - minY));
        }
        p.passed = false;
        endlessBodies.push(p);
        nextPlanetX += 384; 
    }
}

// --- PHYSICS ENGINE ---
function update(dt) {
    if (gameState !== 'playing' && gameState !== 'endless_playing') return;

    const activeBodies = gameState === 'endless_playing' ? endlessBodies : currentBodies;

    // 1. Multi-Body Gravity
    for (let body of activeBodies) {
        const dx = body.x - rocket.x;
        const dy = body.y - rocket.y;
        const distanceSq = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSq);

        if (distance <= body.soiRadius) {
            const gravityForce = ((UNIVERSAL_G * body.mass) / distanceSq) * dt;
            rocket.vx += (dx / distance) * gravityForce;
            rocket.vy += (dy / distance) * gravityForce;
        }
    }

    // 2. Thrust & RCS Controls
    const forwardX = Math.cos(rocket.angle);
    const forwardY = Math.sin(rocket.angle);

    if (keys.s) {
        rocket.vx += (forwardX * THRUST_POWER * dt) / MASS;
        rocket.vy += (forwardY * THRUST_POWER * dt) / MASS;
    }
    if (keys.a) {
        rocket.angularVelocity -= (RCS_TORQUE * dt) / INERTIA; 
    }
    if (keys.d) {
        rocket.angularVelocity += (RCS_TORQUE * dt) / INERTIA; 
    }

    // 3. Integration
    rocket.angle += rocket.angularVelocity * dt;
    rocket.x += rocket.vx * dt;
    rocket.y += rocket.vy * dt;

    // 4. Resolve Surface Dynamics
    resolveRigidCollisions(dt);

    if (gameState === 'endless_playing') {
        updateEndlessMode(dt);
    }
    
    updateSmoothedTrajectory(activeBodies);
}

function resolveRigidCollisions(dt) {
    const cosA = Math.cos(rocket.angle);
    const sinA = Math.sin(rocket.angle);
    const activeBodies = gameState.startsWith('endless') ? endlessBodies : currentBodies;

    for (let bIdx = 0; bIdx < activeBodies.length; bIdx++) {
        const body = activeBodies[bIdx];
        let activeContacts = [];

        for (let c of cornersLocal) {
            const rx = c.x * cosA - c.y * sinA;
            const ry = c.x * sinA + c.y * cosA;
            const worldX = rocket.x + rx;
            const worldY = rocket.y + ry;

            const dx = worldX - body.x;
            const dy = worldY - body.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < body.radius) {
                const nx = dx / dist; 
                const ny = dy / dist;
                const penetration = body.radius - dist;
                activeContacts.push({ rx, ry, nx, ny, penetration });
            }
        }

        if (activeContacts.length > 0) {
            for (let contact of activeContacts) {
                const { rx, ry, nx, ny, penetration } = contact;
                rocket.x += nx * (penetration / activeContacts.length);
                rocket.y += ny * (penetration / activeContacts.length);

                const vpx = rocket.vx - rocket.angularVelocity * ry;
                const vpy = rocket.vy + rocket.angularVelocity * rx;
                const normalVelocity = vpx * nx + vpy * ny;

                if (normalVelocity < 0) {
                    // Unified Crash Check 1: High-Speed Impact
                    if (Math.abs(normalVelocity) > MAX_SAFE_IMPACT) {
                        gameState = gameState === 'playing' ? 'crashed' : 'endless_crashed';
                        return;
                    }

                    const rCrossN = rx * ny - ry * nx;
                    const invMassSum = (1 / MASS) + (rCrossN * rCrossN) / INERTIA;
                    const jNormal = -(1 + RESTITUTION) * normalVelocity / invMassSum;

                    rocket.vx += (jNormal * nx) / MASS;
                    rocket.vy += (jNormal * ny) / MASS;
                    rocket.angularVelocity += (rCrossN * jNormal) / INERTIA;

                    const vpxNew = rocket.vx - rocket.angularVelocity * ry;
                    const vpyNew = rocket.vy + rocket.angularVelocity * rx;
                    const tx = -ny, ty = nx;
                    const tangentVelocity = vpxNew * tx + vpyNew * ty;
                    const rCrossT = rx * ty - ry * tx;
                    const invMassSumT = (1 / MASS) + (rCrossT * rCrossT) / INERTIA;

                    let jTangent = -tangentVelocity / invMassSumT;
                    const maxFriction = FRICTION * jNormal;
                    jTangent = Math.max(-maxFriction, Math.min(maxFriction, jTangent));

                    rocket.vx += (jTangent * tx) / MASS;
                    rocket.vy += (jTangent * ty) / MASS;
                    rocket.angularVelocity += (rCrossT * jTangent) / INERTIA;
                }
            }

            // --- CURVATURE TILT & SAFE LANDING ---
            const angleToRocket = Math.atan2(rocket.y - body.y, rocket.x - body.x);
            
            let normRocketAngle = rocket.angle % (Math.PI * 2);
            if (normRocketAngle < 0) normRocketAngle += Math.PI * 2;
            
            let normToRocket = angleToRocket % (Math.PI * 2);
            if (normToRocket < 0) normToRocket += Math.PI * 2;
            
            let tiltDiff = Math.abs(normRocketAngle - normToRocket);
            if (tiltDiff > Math.PI) tiltDiff = (Math.PI * 2) - tiltDiff;

            // Unified Crash Check 2: Tipping over
            if (tiltDiff > 1.35) {
                gameState = gameState === 'playing' ? 'crashed' : 'endless_crashed';
                return;
            }

            // Landing Success Logic (Only applies to levels)
            if (gameState === 'playing') {
                if (bIdx === targetLanding.bodyIndex) {
                    let zoneDiff = Math.abs(normToRocket - ((targetLanding.angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)));
                    if (zoneDiff > Math.PI) zoneDiff = (Math.PI * 2) - zoneDiff;

                    const currentSpeed = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
                    const isInZone = zoneDiff < LANDING_ZONE_CONFIG.width;
                    const isUpright = tiltDiff < 0.6;
                    const isStable = currentSpeed < 0.4 && Math.abs(rocket.angularVelocity) < 0.05;

                    if (isInZone && isUpright && isStable) {
                        if (landingTimer === 0) touchdownTime = Date.now() - startTime;
                        landingTimer += dt * (1000 / 60);

                        if (landingTimer >= 3000) {
                            gameState = 'won';
                            finalTime = touchdownTime;
                            
                            if (!bestTimes[currentLevelIdx + 1] || finalTime < bestTimes[currentLevelIdx + 1]) {
                                bestTimes[currentLevelIdx + 1] = finalTime;
                            }
                            if (currentLevelIdx + 2 > unlockedLevels && currentLevelIdx + 1 < LEVELS.length) {
                                unlockedLevels = currentLevelIdx + 2;
                            }
                            saveProgress();
                        }
                    } else {
                        landingTimer = 0;
                    }
                } else {
                    landingTimer = 0;
                }
            }
        }
    }

    if (gameState === 'playing') {
        if (rocket.x < -100 || rocket.x > WIDTH + 100 || rocket.y < -100 || rocket.y > HEIGHT + 100) {
            gameState = 'crashed';
        }
    }
}

function updateEndlessMode(dt) {
    cameraX = Math.max(0, rocket.x - 200);
    generateEndlessPlanets();

    for (let body of endlessBodies) {
        if (!body.passed && rocket.x > body.x + body.radius) {
            body.passed = true;
            endlessScore++;
            if (endlessScore > endlessHighScore) {
                endlessHighScore = endlessScore;
                saveProgress();
            }
        }
    }

    if (rocket.y < -400 || rocket.y > HEIGHT + 400) {
        gameState = 'endless_crashed';
    }
}

// --- TRAJECTORY PREDICTION ---
function predictTargetTrajectory(activeBodies) {
    const rawPoints = [];
    let simX = rocket.x, simY = rocket.y;
    let simVx = rocket.vx, simVy = rocket.vy;
    let simAngle = rocket.angle, simAngVel = rocket.angularVelocity;
    
    const PREDICT_STEPS = 600;
    
    for (let i = 0; i < PREDICT_STEPS; i++) {
        let hitSurface = false;

        for (let body of activeBodies) {
            const dx = body.x - simX;
            const dy = body.y - simY;
            const distanceSq = dx * dx + dy * dy;
            const distance = Math.sqrt(distanceSq);

            if (distance < body.radius) {
                hitSurface = true;
                break;
            }

            if (distance <= body.soiRadius) {
                const gravityForce = (UNIVERSAL_G * body.mass) / distanceSq;
                simVx += (dx / distance) * gravityForce;
                simVy += (dy / distance) * gravityForce;
            }
        }

        if (hitSurface) break;

        const forwardX = Math.cos(simAngle);
        const forwardY = Math.sin(simAngle);

        if (keys.s) {
            simVx += (forwardX * THRUST_POWER) / MASS;
            simVy += (forwardY * THRUST_POWER) / MASS;
        }
        if (keys.a) simAngVel -= RCS_TORQUE / INERTIA;
        if (keys.d) simAngVel += RCS_TORQUE / INERTIA;

        simAngle += simAngVel;
        simX += simVx;
        simY += simVy;

        rawPoints.push({ x: simX, y: simY });
    }
    return rawPoints;
}

function updateSmoothedTrajectory(activeBodies) {
    const targetPoints = predictTargetTrajectory(activeBodies);
    const SMOOTH_FACTOR = 0.12; 

    while (visualTrajectory.length < targetPoints.length) {
        const lastPt = visualTrajectory.length > 0 ? visualTrajectory[visualTrajectory.length - 1] : { x: rocket.x, y: rocket.y };
        visualTrajectory.push({ x: lastPt.x, y: lastPt.y });
    }
    if (visualTrajectory.length > targetPoints.length) visualTrajectory.length = targetPoints.length;

    for (let i = 0; i < targetPoints.length; i++) {
        visualTrajectory[i].x += (targetPoints[i].x - visualTrajectory[i].x) * SMOOTH_FACTOR;
        visualTrajectory[i].y += (targetPoints[i].y - visualTrajectory[i].y) * SMOOTH_FACTOR;
    }
}

// --- UI HELPERS ---
function drawButton(text, x, y, w, h, bgColor, textColor, font = '18px monospace') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    
    ctx.fillStyle = textColor;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
}

function drawBackground(camX, camY) {
    // Check naturalWidth to ensure the image has actually loaded its data
    if (!bgStarsImg.complete || bgStarsImg.naturalWidth === 0) return; 

    if (gameState.startsWith('endless')) {
        const parallaxFactor = 0.2; 
        const offsetX = (camX * parallaxFactor) % bgStarsImg.width;
        const offsetY = (camY * parallaxFactor) % bgStarsImg.height;

        for (let x = -offsetX - bgStarsImg.width; x < WIDTH; x += bgStarsImg.width) {
            for (let y = -offsetY - bgStarsImg.height; y < HEIGHT; y += bgStarsImg.height) {
                ctx.drawImage(bgStarsImg, x, y);
            }
        }
    } else {
        ctx.save();
        ctx.translate(WIDTH / 2, HEIGHT / 2);
        
        const rotationSpeed = 0.00003; 
        ctx.rotate(-Date.now() * rotationSpeed); 
        
        const scale = (Math.max(WIDTH, HEIGHT) / bgStarsImg.width) * 2; 
        ctx.scale(scale, scale);
        
        ctx.drawImage(bgStarsImg, -bgStarsImg.width / 2, -bgStarsImg.height / 2);
        ctx.restore();
    }
}

// --- RENDER ENGINE ---
function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (gameState === 'main_menu') {
        ctx.fillStyle = '#fff';
        ctx.font = '64px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Orbit-42', WIDTH / 2, HEIGHT * 0.3);

        drawButton('Settings', WIDTH - 130, 20, 110, 35, '#222', '#fff');
        drawButton('Levels', 0, HEIGHT / 2, WIDTH / 2, HEIGHT / 2, '#111', '#fff', '32px monospace');
        
        ctx.fillStyle = '#111';
        ctx.fillRect(WIDTH / 2, HEIGHT / 2, WIDTH / 2, HEIGHT / 2);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(WIDTH / 2, HEIGHT / 2, WIDTH / 2, HEIGHT / 2);
        ctx.fillStyle = '#fff';
        ctx.font = '32px monospace';
        ctx.fillText('Endless', (WIDTH * 3) / 4, HEIGHT / 2 + 100);
        ctx.font = '18px monospace';
        ctx.fillStyle = '#aaa';
        ctx.fillText(`High Score: ${endlessHighScore}`, (WIDTH * 3) / 4, HEIGHT / 2 + 150);
        return;
    }

    if (gameState === 'settings') {
        drawButton('Back', 20, 20, 80, 35, '#222', '#fff');
        ctx.fillStyle = '#fff';
        ctx.font = '48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Settings', WIDTH / 2, HEIGHT * 0.3);
        ctx.font = '24px monospace';
        ctx.fillText('(Coming Soon)', WIDTH / 2, HEIGHT * 0.5);
        return;
    }

    if (gameState === 'level_select') {
        drawButton('Back', 20, 20, 80, 35, '#222', '#fff');
        ctx.fillStyle = '#fff';
        ctx.font = '48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('World 1', WIDTH / 2, HEIGHT * 0.15);

        const startX = 94, startY = 220, gapX = 116, gapY = 110;

        for (let i = 0; i < 10; i++) {
            let col = i % 5, row = Math.floor(i / 5);
            let bx = startX + col * gapX, by = startY + row * gapY;
            let levelNum = i + 1;
            
            if (levelNum <= unlockedLevels) {
                drawButton(`#${levelNum}`, bx, by, 80, 80, '#3a8', '#fff', '24px monospace');
                if (bestTimes[levelNum]) {
                    ctx.fillStyle = '#dfd';
                    ctx.font = '12px monospace';
                    ctx.fillText(`${(bestTimes[levelNum] / 1000).toFixed(1)}s`, bx + 40, by + 62);
                }
            } else {
                drawButton(`#${levelNum}`, bx, by, 80, 80, '#222', '#555', '24px monospace');
            }
        }
        return;
    }

    // Render Dual-Mode Star Background before translations
    drawBackground(cameraX, 0);

    // --- IN-GAME RENDERING ---
    ctx.save();
    if (gameState.startsWith('endless')) {
        ctx.translate(-cameraX, 0);

        const startBoxWidth = WIDTH / 5;
        ctx.fillStyle = '#4ba3c3';
        ctx.fillRect(0, 0, startBoxWidth, HEIGHT);
    }

    const activeBodies = gameState.startsWith('endless') ? endlessBodies : currentBodies;

    // 1. Draw Target Landing Zone (Levels only)
    if (gameState === 'playing' || gameState === 'crashed' || gameState === 'won') {
        const body = currentBodies[targetLanding.bodyIndex];
        if (body) {
            const lzX = body.x + Math.cos(targetLanding.angle) * body.radius;
            const lzY = body.y + Math.sin(targetLanding.angle) * body.radius;
            
            ctx.beginPath();
            ctx.arc(lzX, lzY, LANDING_ZONE_CONFIG.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(127, 178, 133, 0.5)'; 
            ctx.fill();
        }
    }

    // 2. Draw Planetary Bodies & SOIs
    for (let i = 0; i < activeBodies.length; i++) {
        const body = activeBodies[i];

        ctx.beginPath();
        ctx.arc(body.x, body.y, body.soiRadius, 0, Math.PI * 2);
        ctx.strokeStyle = body.soiBorder;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        let planetImg;
        let scaleFactor = 1.0; 

        if (body.name === "Moon") { 
            planetImg = moonImg;
            scaleFactor = 1.15; 
        } else if (body.name === "Earth") { 
            planetImg = earthImg;
            scaleFactor = 1.15; 
        } else if (body.name === "Mars") { 
            planetImg = marsImg;
            scaleFactor = 1.0;  
        }

        // Check naturalWidth to ensure the image actually exists and isn't broken
        if (planetImg && planetImg.complete && planetImg.naturalWidth > 0) {
            const drawRadius = body.radius * scaleFactor;
            // Calculate the intrinsic aspect ratio to prevent stretching
            const aspect = planetImg.naturalWidth / planetImg.naturalHeight;
            
            ctx.drawImage(
                planetImg, 
                body.x - (drawRadius * aspect), 
                body.y - drawRadius, 
                (drawRadius * 2) * aspect, 
                drawRadius * 2
            );
        } else {
            // Safe fallback to the colored circle if the image is missing or loading
            ctx.beginPath();
            ctx.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
            ctx.fillStyle = body.color;
            ctx.fill();
        }
    }

    // 3. Trajectory Line
    if ((gameState === 'playing' || gameState === 'endless_playing') && visualTrajectory.length > 0) {
        ctx.beginPath();
        ctx.moveTo(rocket.x, rocket.y);
        for (let pt of visualTrajectory) ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 5]); 
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // 4. Rocket Sprite
    ctx.save();
    ctx.translate(rocket.x, rocket.y);
    ctx.rotate(rocket.angle + Math.PI / 2);
    
    // Prevent a game-crashing error by waiting for the image
    if (rocketImg.complete && rocketImg.naturalWidth > 0) {
        const frameY = (keys.s && (gameState === 'playing' || gameState === 'endless_playing')) ? 16 : 0;
        ctx.drawImage(rocketImg, 0, frameY, 16, 16, -12, -12, 24, 24);
    } else {
        // Temporary fallback shape so you can still play while it loads
        ctx.fillStyle = '#fff';
        ctx.fillRect(-6, -12, 12, 24);
    }
    ctx.restore();

    ctx.restore(); 

    // --- OVERLAY UI ---
    drawButton('Back', 20, 20, 80, 35, '#222', '#fff');

    ctx.fillStyle = '#fff';
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    
    if (gameState === 'playing') {
        const elapsed = Date.now() - startTime;
        ctx.fillText(`${(elapsed / 1000).toFixed(2)}s`, WIDTH / 2, 40);
        if (landingTimer > 0) {
            ctx.fillStyle = '#0f0';
            ctx.fillText(`Verifying: ${(3 - landingTimer / 1000).toFixed(1)}s`, WIDTH / 2, 80);
        }
    } else if (gameState === 'crashed') {
        ctx.fillStyle = '#f00';
        ctx.fillText('CRASHED! Press Space to Retry', WIDTH / 2, 40);
    } else if (gameState === 'won') {
        ctx.fillStyle = '#0f0';
        ctx.fillText(`SUCCESS! Time: ${(finalTime / 1000).toFixed(2)}s`, WIDTH / 2, 40);
        ctx.fillText('Press Space for Next Level', WIDTH / 2, 75);
    } else if (gameState === 'endless_playing') {
        ctx.fillText(`Score: ${endlessScore}  High: ${endlessHighScore}`, WIDTH / 2, 40);
    } else if (gameState === 'endless_crashed') {
        ctx.fillStyle = '#f00';
        ctx.fillText(`GAME OVER! Score: ${endlessScore}`, WIDTH / 2, 40);
        ctx.fillText('Press Space to Restart', WIDTH / 2, 75);
    }
}

function gameLoop(now) {
    let dt = (now - lastTime) / (1000 / 60);
    if (isNaN(dt) || dt > 2.0) dt = 1.0;
    lastTime = now;

    update(dt);
    draw();
    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);