const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- GAME CONSTANTS ---
const WIDTH = 768;
const HEIGHT = 576;
const UNIVERSAL_G = 0.1; 

// Rigid Body Physics Parameters
const MASS = 1.0;
const SIZE = 16;
// Moment of inertia for a square box: I = (1/6) * m * s^2
const INERTIA = (1 / 6) * MASS * SIZE * SIZE; 
const RESTITUTION = 0.15; // Bounce elasticity (landing leg shock absorption)
const FRICTION = 0.55;    // Surface friction on moon ground
const MAX_SAFE_IMPACT = 2.4; // Impact velocity threshold before crushing

const THRUST_POWER = 0.08; 
const RCS_TORQUE = 0.018;  // Angular torque applied by RCS thrusters

// --- ENTITIES ---
const moon = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    radius: 40,
    mass: 40 * 40 
};

// Corner offsets in local rocket coordinates (Center of Mass at 0,0)
const cornersLocal = [
    { x: -SIZE / 2, y: -SIZE / 2 }, // Rear Left
    { x:  SIZE / 2, y: -SIZE / 2 }, // Front Left
    { x:  SIZE / 2, y:  SIZE / 2 }, // Front Right
    { x: -SIZE / 2, y:  SIZE / 2 }  // Rear Right
];

const landingZone = {
    angle: Math.PI / 2, 
    width: 0.4,         
    height: 15
};

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
    return {
        x: WIDTH / 2,
        y: (HEIGHT / 2) - moon.radius - 12, 
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

    // 1. Center of Mass Gravitational Attraction
    const dx = moon.x - rocket.x;
    const dy = moon.y - rocket.y;
    const distanceSq = dx * dx + dy * dy;
    const distance = Math.sqrt(distanceSq);
    
    const gravityForce = (UNIVERSAL_G * moon.mass) / distanceSq;
    rocket.vx += (dx / distance) * gravityForce;
    rocket.vy += (dy / distance) * gravityForce;

    // 2. Applied Forces & Torque (Thrust/RCS)
    const forwardX = Math.cos(rocket.angle);
    const forwardY = Math.sin(rocket.angle);

    if (keys.s) {
        // Linear thrust through Center of Mass (no torque)
        rocket.vx += (forwardX * THRUST_POWER) / MASS;
        rocket.vy += (forwardY * THRUST_POWER) / MASS;
    }
    if (keys.a) {
        // Torque: Angular Acceleration α = Torque / Inertia
        rocket.angularVelocity -= RCS_TORQUE / INERTIA; 
    }
    if (keys.d) {
        rocket.angularVelocity += RCS_TORQUE / INERTIA; 
    }

    // Rotational damping in space (slight stability stabilization)
    rocket.angularVelocity *= 0.998;

    // 3. Integrate Motion
    rocket.angle += rocket.angularVelocity;
    rocket.x += rocket.vx;
    rocket.y += rocket.vy;

    // 4. Rigid Body Collision & Reaction Physics
    resolveRigidCollisions();
}

// --- IMPULSE-BASED RIGID BODY COLLISION ---
function resolveRigidCollisions() {
    const cosA = Math.cos(rocket.angle);
    const sinA = Math.sin(rocket.angle);

    let activeContacts = [];

    // Test all 4 corners of the rocket box against moon surface
    for (let c of cornersLocal) {
        // Rotate corner offset to world space relative to Center of Mass
        const rx = c.x * cosA - c.y * sinA;
        const ry = c.x * sinA + c.y * cosA;

        const worldX = rocket.x + rx;
        const worldY = rocket.y + ry;

        const dx = worldX - moon.x;
        const dy = worldY - moon.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Check penetration with moon sphere
        if (dist < moon.radius) {
            const nx = dx / dist; // Outward surface normal
            const ny = dy / dist;
            const penetration = moon.radius - dist;
            activeContacts.push({ rx, ry, nx, ny, penetration });
        }
    }

    if (activeContacts.length === 0) {
        landingTimer = 0;
    } else {
        let isLandingZoneContact = false;

        for (let contact of activeContacts) {
            const { rx, ry, nx, ny, penetration } = contact;

            // Positional correction to eliminate overlap
            rocket.x += nx * (penetration / activeContacts.length);
            rocket.y += ny * (penetration / activeContacts.length);

            // Contact point velocity: V_point = V_com + (ω x r)
            const vpx = rocket.vx - rocket.angularVelocity * ry;
            const vpy = rocket.vy + rocket.angularVelocity * rx;

            // Velocity along normal
            const normalVelocity = vpx * nx + vpy * ny;

            // Only respond if moving into the moon surface
            if (normalVelocity < 0) {
                // Check crash velocity threshold
                if (Math.abs(normalVelocity) > MAX_SAFE_IMPACT) {
                    gameState = 'crashed';
                    return;
                }

                // Normal Impulse scalar calculation (2D Impulse Solver)
                // 2D Cross product scalar: r x n = rx * ny - ry * nx
                const rCrossN = rx * ny - ry * nx;
                const invMassSum = (1 / MASS) + (rCrossN * rCrossN) / INERTIA;
                const jNormal = -(1 + RESTITUTION) * normalVelocity / invMassSum;

                // Apply Normal Impulse to Linear and Angular Velocities
                rocket.vx += (jNormal * nx) / MASS;
                rocket.vy += (jNormal * ny) / MASS;
                rocket.angularVelocity += (rCrossN * jNormal) / INERTIA;

                // Re-calculate point velocity after normal impulse for friction
                const vpxNew = rocket.vx - rocket.angularVelocity * ry;
                const vpyNew = rocket.vy + rocket.angularVelocity * rx;

                // Friction Impulse (Tangent Vector)
                const tx = -ny;
                const ty = nx;
                const tangentVelocity = vpxNew * tx + vpyNew * ty;
                const rCrossT = rx * ty - ry * tx;
                const invMassSumT = (1 / MASS) + (rCrossT * rCrossT) / INERTIA;

                let jTangent = -tangentVelocity / invMassSumT;

                // Clamp friction to Coulomb Friction limit (|F_f| <= μ * F_n)
                const maxFriction = FRICTION * jNormal;
                jTangent = Math.max(-maxFriction, Math.min(maxFriction, jTangent));

                // Apply Friction Impulse
                rocket.vx += (jTangent * tx) / MASS;
                rocket.vy += (jTangent * ty) / MASS;
                rocket.angularVelocity += (rCrossT * jTangent) / INERTIA;
            }
        }

        // --- LANDING EVALUATION ---
        const angleToRocket = Math.atan2(rocket.y - moon.y, rocket.x - moon.x);
        let tiltDifference = Math.abs((rocket.angle % (Math.PI * 2)) - angleToRocket);
        if (tiltDifference > Math.PI) tiltDifference = (Math.PI * 2) - tiltDifference;

        const currentSpeed = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
        const isInLandingZone = Math.abs(angleToRocket - landingZone.angle) < landingZone.width;
        const isUpright = tiltDifference < 0.6; // ~34 degrees max tilt
        const isStable = currentSpeed < 0.4 && Math.abs(rocket.angularVelocity) < 0.05;

        // If rocket tipped over completely onto its side while touching moon, crash it
        if (tiltDifference > 1.35) {
            gameState = 'crashed';
            return;
        }

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
    }

    // Out of bounds screen safe boundary
    if (rocket.x < -100 || rocket.x > WIDTH + 100 || rocket.y < -100 || rocket.y > HEIGHT + 100) {
        gameState = 'crashed';
    }
}

// --- RENDER ENGINE ---
function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Draw Moon
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#888';
    ctx.fill();

    // Draw Landing Zone
    ctx.save();
    ctx.translate(moon.x, moon.y);
    ctx.rotate(landingZone.angle);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(moon.radius - 2, -15, 20, 30);
    ctx.restore();

    // Draw Rocket
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

    // Draw UI
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
        ctx.fillText(`SUCCESS! Time: ${seconds}.${ms}s`, WIDTH / 2, 40);
    }

    requestAnimationFrame(gameLoop);
}

function gameLoop() {
    update();
    draw();
}

// Start game loop
requestAnimationFrame(gameLoop);