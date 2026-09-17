const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- GAME CONSTANTS ---
const WIDTH = 768;
const HEIGHT = 576;
const UNIVERSAL_G = 0.1; 

// Rigid Body Physics Parameters
const MASS = 1.0;
const SIZE = 16;
const INERTIA = (1 / 6) * MASS * SIZE * SIZE; 
const RESTITUTION = 0.15; 
const FRICTION = 0.55;    
const MAX_SAFE_IMPACT = 2.4; 

const THRUST_POWER = 0.08; 
const RCS_TORQUE = 0.018;  

// --- SINGLE MOON WITH SPHERE OF INFLUENCE ---
const moon = {
    name: "Luna",
    x: WIDTH / 2,
    y: HEIGHT / 2,
    radius: 40,
    soiRadius: 40 * 2.6, // Shrunk by ~42%, scales proportionally based on radius
    mass: 40 * 40,
    color: '#888',
    soiColor: 'rgba(200, 200, 200, 0.08)',
    soiBorder: 'rgba(200, 200, 200, 0.4)'
};

// Landing zone attached to the bottom of the moon
const landingZone = {
    angle: Math.PI / 2, 
    width: 0.4,         
    height: 15
};

// Box Corner Offsets for Rigid Collision Solver
const cornersLocal = [
    { x: -SIZE / 2, y: -SIZE / 2 }, 
    { x:  SIZE / 2, y: -SIZE / 2 }, 
    { x:  SIZE / 2, y:  SIZE / 2 }, 
    { x: -SIZE / 2, y:  SIZE / 2 }  
];

// Variables declared in correct order to prevent initialization errors
let visualTrajectory = []; 
let rocket = resetRocket();
let keys = { a: false, d: false, s: false };
let startTime = Date.now();
let landingTimer = 0;
let touchdownTime = 0; 
let finalTime = 0;     
let gameState = 'playing'; 

// --- INPUT HANDLING ---
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'a') keys.a = true;
    if (e.key.toLowerCase() === 'd') keys.d = true;
    if (e.key.toLowerCase() === 's') keys.s = true;
    
    if (e.key === ' ' && gameState !== 'playing') {
        rocket = resetRocket();
        startTime = Date.now();
        landingTimer = 0;
        touchdownTime = 0;
        finalTime = 0;
        gameState = 'playing';
    }
});
window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'a') keys.a = false;
    if (e.key.toLowerCase() === 'd') keys.d = false;
    if (e.key.toLowerCase() === 's') keys.s = false;
});

function resetRocket() {
    visualTrajectory = [];
    return {
        x: moon.x,
        y: moon.y - moon.radius - 12, 
        vx: 0, 
        vy: 0,
        angle: -Math.PI / 2, 
        angularVelocity: 0,
        size: SIZE
    };
}

// --- PHYSICS ENGINE ---
function update() {
    if (gameState !== 'playing') return;

    // 1. Gravitational Attraction within Sphere of Influence (SOI)
    const dx = moon.x - rocket.x;
    const dy = moon.y - rocket.y;
    const distanceSq = dx * dx + dy * dy;
    const distance = Math.sqrt(distanceSq);

    if (distance <= moon.soiRadius) {
        const gravityForce = (UNIVERSAL_G * moon.mass) / distanceSq;
        rocket.vx += (dx / distance) * gravityForce;
        rocket.vy += (dy / distance) * gravityForce;
    }

    // 2. Thrust & Torque Controls
    const forwardX = Math.cos(rocket.angle);
    const forwardY = Math.sin(rocket.angle);

    if (keys.s) {
        rocket.vx += (forwardX * THRUST_POWER) / MASS;
        rocket.vy += (forwardY * THRUST_POWER) / MASS;
    }
    if (keys.a) {
        rocket.angularVelocity -= RCS_TORQUE / INERTIA; 
    }
    if (keys.d) {
        rocket.angularVelocity += RCS_TORQUE / INERTIA; 
    }

    // Rotational damping in space
    rocket.angularVelocity *= 0.998;

    // 3. Motion Integration
    rocket.angle += rocket.angularVelocity;
    rocket.x += rocket.vx;
    rocket.y += rocket.vy;

    // 4. Rigid Body Collision Resolution
    resolveRigidCollisions();

    // 5. Update Smoothed Visual Trajectory Line
    updateSmoothedTrajectory();
}

// --- IMPULSE RIGID BODY COLLISION SOLVER ---
function resolveRigidCollisions() {
    const cosA = Math.cos(rocket.angle);
    const sinA = Math.sin(rocket.angle);
    let activeContacts = [];

    // Test rocket corners against moon surface
    for (let c of cornersLocal) {
        const rx = c.x * cosA - c.y * sinA;
        const ry = c.x * sinA + c.y * cosA;

        const worldX = rocket.x + rx;
        const worldY = rocket.y + ry;

        const dx = worldX - moon.x;
        const dy = worldY - moon.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < moon.radius) {
            const nx = dx / dist; 
            const ny = dy / dist;
            const penetration = moon.radius - dist;
            activeContacts.push({ rx, ry, nx, ny, penetration });
        }
    }

    if (activeContacts.length > 0) {
        for (let contact of activeContacts) {
            const { rx, ry, nx, ny, penetration } = contact;

            // Positional separation
            rocket.x += nx * (penetration / activeContacts.length);
            rocket.y += ny * (penetration / activeContacts.length);

            // Point velocity
            const vpx = rocket.vx - rocket.angularVelocity * ry;
            const vpy = rocket.vy + rocket.angularVelocity * rx;
            const normalVelocity = vpx * nx + vpy * ny;

            if (normalVelocity < 0) {
                if (Math.abs(normalVelocity) > MAX_SAFE_IMPACT) {
                    gameState = 'crashed';
                    return;
                }

                // Normal Impulse
                const rCrossN = rx * ny - ry * nx;
                const invMassSum = (1 / MASS) + (rCrossN * rCrossN) / INERTIA;
                const jNormal = -(1 + RESTITUTION) * normalVelocity / invMassSum;

                rocket.vx += (jNormal * nx) / MASS;
                rocket.vy += (jNormal * ny) / MASS;
                rocket.angularVelocity += (rCrossN * jNormal) / INERTIA;

                // Friction Impulse
                const vpxNew = rocket.vx - rocket.angularVelocity * ry;
                const vpyNew = rocket.vy + rocket.angularVelocity * rx;
                const tx = -ny;
                const ty = nx;
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

        // --- LANDING VERIFICATION ---
        const angleToRocket = Math.atan2(rocket.y - moon.y, rocket.x - moon.x);
        let tiltDifference = Math.abs((rocket.angle % (Math.PI * 2)) - angleToRocket);
        if (tiltDifference > Math.PI) tiltDifference = (Math.PI * 2) - tiltDifference;

        const currentSpeed = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
        const isInLandingZone = Math.abs(angleToRocket - landingZone.angle) < landingZone.width;
        const isUpright = tiltDifference < 0.6;
        const isStable = currentSpeed < 0.4 && Math.abs(rocket.angularVelocity) < 0.05;

        if (tiltDifference > 1.35) {
            gameState = 'crashed';
            return;
        }
// commit
        if (isInLandingZone && isUpright && isStable) {
            if (landingTimer === 0) {
                touchdownTime = Date.now() - startTime;
            }
            landingTimer += 1000 / 60;

            if (landingTimer >= 3000 && gameState === 'playing') {
                gameState = 'won';
                finalTime = touchdownTime;
            }
        } else {
            landingTimer = 0;
        }
    } else {
        landingTimer = 0;
    }

    // Out of bounds screen safe boundary
    if (rocket.x < -100 || rocket.x > WIDTH + 100 || rocket.y < -100 || rocket.y > HEIGHT + 100) {
        gameState = 'crashed';
    }
}

// --- TRAJECTORY PREDICTION & SMOOTHING ---
function predictTargetTrajectory() {
    const rawPoints = [];
    let simX = rocket.x;
    let simY = rocket.y;
    let simVx = rocket.vx;
    let simVy = rocket.vy;
    let simAngle = rocket.angle;
    let simAngVel = rocket.angularVelocity;
    
    // Prediction steps increased to 600 for a 5x longer line
    const PREDICT_STEPS = 600;
    
    for (let i = 0; i < PREDICT_STEPS; i++) {
        const dx = moon.x - simX;
        const dy = moon.y - simY;
        const distanceSq = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSq);

        if (distance <= moon.soiRadius) {
            const gravityForce = (UNIVERSAL_G * moon.mass) / distanceSq;
            simVx += (dx / distance) * gravityForce;
            simVy += (dy / distance) * gravityForce;
        }

        const forwardX = Math.cos(simAngle);
        const forwardY = Math.sin(simAngle);

        if (keys.s) {
            simVx += (forwardX * THRUST_POWER) / MASS;
            simVy += (forwardY * THRUST_POWER) / MASS;
        }
        if (keys.a) {
            simAngVel -= RCS_TORQUE / INERTIA;
        }
        if (keys.d) {
            simAngVel += RCS_TORQUE / INERTIA;
        }

        simAngVel *= 0.998;

        simAngle += simAngVel;
        simX += simVx;
        simY += simVy;

        rawPoints.push({ x: simX, y: simY });

        if (distance < moon.radius) {
            break; 
        }
    }
    return rawPoints;
}

function updateSmoothedTrajectory() {
    const targetPoints = predictTargetTrajectory();
    const SMOOTH_FACTOR = 0.12; 

    // Ensure array length matches target size dynamically
    while (visualTrajectory.length < targetPoints.length) {
        const lastPt = visualTrajectory.length > 0 
            ? visualTrajectory[visualTrajectory.length - 1] 
            : { x: rocket.x, y: rocket.y };
        visualTrajectory.push({ x: lastPt.x, y: lastPt.y });
    }
    if (visualTrajectory.length > targetPoints.length) {
        visualTrajectory.length = targetPoints.length;
    }

    // Linearly interpolate (LERP) each point toward the new target prediction
    for (let i = 0; i < targetPoints.length; i++) {
        visualTrajectory[i].x += (targetPoints[i].x - visualTrajectory[i].x) * SMOOTH_FACTOR;
        visualTrajectory[i].y += (targetPoints[i].y - visualTrajectory[i].y) * SMOOTH_FACTOR;
    }
}

// --- RENDER ENGINE ---
function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // 1. Draw See-Through Sphere of Influence (SOI) Circle
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.soiRadius, 0, Math.PI * 2);
    ctx.fillStyle = moon.soiColor;
    ctx.fill();
    ctx.strokeStyle = moon.soiBorder;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw Solid Moon Surface
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.radius, 0, Math.PI * 2);
    ctx.fillStyle = moon.color;
    ctx.fill();

    // 3. Draw Landing Zone Target Pad
    ctx.save();
    ctx.translate(moon.x, moon.y);
    ctx.rotate(landingZone.angle);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(moon.radius - 2, -15, 20, 30);
    ctx.restore();

    // 4. Draw Smoothed Trajectory Prediction Line
    if (gameState === 'playing' && visualTrajectory.length > 0) {
        ctx.beginPath();
        ctx.moveTo(rocket.x, rocket.y);
        for (let pt of visualTrajectory) {
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 5]); // Dotted line pattern
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // 5. Draw Rocket
    ctx.save();
    ctx.translate(rocket.x, rocket.y);
    ctx.rotate(rocket.angle);
    
    ctx.fillStyle = '#ccc';
    ctx.fillRect(-rocket.size / 2, -rocket.size / 2, rocket.size, rocket.size);

    // Draw Visual Thrust/RCS Flames
    ctx.fillStyle = '#f90';
    if (keys.s) { 
        ctx.fillRect(-rocket.size / 2 - 12, -4, 12, 8);
    }
    if (keys.a) { 
        ctx.fillRect(-rocket.size / 2 - 4, rocket.size / 2, 6, 6);
    }
    if (keys.d) { 
        ctx.fillRect(-rocket.size / 2 - 4, -rocket.size / 2 - 6, 6, 6);
    }
    
    ctx.restore();

    // Draw UI Overlay
    ctx.fillStyle = '#fff';
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    
    if (gameState === 'playing') {
        const elapsed = Date.now() - startTime;
        const seconds = Math.floor(elapsed / 1000);
        const ms = String(elapsed % 1000).padStart(3, '0');
        ctx.fillText(`${seconds}.${ms}s`, WIDTH / 2, 40);
        
        if (landingTimer > 0) {
            ctx.fillStyle = '#0f0';
            ctx.fillText(`Verifying: ${(3 - landingTimer/1000).toFixed(1)}s`, WIDTH / 2, 80);
        }
    } else if (gameState === 'crashed') {
        ctx.fillStyle = '#f00';
        ctx.fillText('CRASHED! Press Space to Retry', WIDTH / 2, 40);
    } else if (gameState === 'won') {
        ctx.fillStyle = '#0f0';
        const seconds = Math.floor(finalTime / 1000);
        const ms = String(finalTime % 1000).padStart(3, '0');
        ctx.fillText( `SUCCESS! Time: ${seconds}.${ms}s`, WIDTH / 2, 40);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start game loop
requestAnimationFrame(gameLoop);