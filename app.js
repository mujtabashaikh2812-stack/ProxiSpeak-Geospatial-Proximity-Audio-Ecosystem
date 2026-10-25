const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusText = document.getElementById("statusText");
const userList = document.getElementById("userList");

const me = { x: 220, y: 260, radius: 14, color: "#2c7ef7" };
const others = [
  { name: "Aisha", x: 560, y: 180, radius: 12, color: "#2ecf7d" },
  { name: "Nikhil", x: 700, y: 320, radius: 12, color: "#8e78ff" },
  { name: "Priya", x: 460, y: 440, radius: 12, color: "#ff9f43" }
];

const keys = {};
const proximityRadius = 140;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function updateStatus() {
  const nearby = others.filter(user => distance(me, user) <= proximityRadius);
  if (nearby.length === 0) {
    statusText.textContent = "In open space";
  } else {
    statusText.textContent = `Near ${nearby.length} people`;
  }
}

function renderUserList() {
  const rows = [{ name: "You", status: statusText.textContent }];
  others.forEach(user => {
    const near = distance(me, user) <= proximityRadius ? "Near" : "Far";
    rows.push({ name: user.name, status: near });
  });

  userList.innerHTML = rows
    .map(row => `<li><span>${row.name}</span> <strong>${row.status}</strong></li>`)
    .join("");
}

function drawRoom() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#edf3fb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#dfe7f3";
  ctx.lineWidth = 10;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

  const desks = [
    { x: 110, y: 110, w: 120, h: 80 },
    { x: 300, y: 110, w: 120, h: 80 },
    { x: 640, y: 120, w: 120, h: 80 },
    { x: 150, y: 380, w: 150, h: 90 },
    { x: 500, y: 360, w: 150, h: 100 }
  ];

  ctx.fillStyle = "#cbd7e6";
  desks.forEach(desk => {
    ctx.fillRect(desk.x, desk.y, desk.w, desk.h);
  });

  ctx.beginPath();
  ctx.strokeStyle = "rgba(44,126,247,0.25)";
  ctx.lineWidth = 2;
  ctx.arc(me.x, me.y, proximityRadius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawAvatar(user, isMe = false) {
  ctx.beginPath();
  ctx.fillStyle = isMe ? me.color : user.color;
  ctx.arc(user.x, user.y, user.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1f2937";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(isMe ? "You" : user.name, user.x, user.y - user.radius - 12);
}

function movePlayer() {
  if (keys["ArrowUp"] || keys["w"]) me.y -= 3;
  if (keys["ArrowDown"] || keys["s"]) me.y += 3;
  if (keys["ArrowLeft"] || keys["a"]) me.x -= 3;
  if (keys["ArrowRight"] || keys["d"]) me.x += 3;

  me.x = Math.max(40, Math.min(canvas.width - 40, me.x));
  me.y = Math.max(40, Math.min(canvas.height - 40, me.y));
}

function animate() {
  movePlayer();
  updateStatus();
  renderUserList();

  drawRoom();
  drawAvatar(me, true);

  others.forEach(user => {
    const near = distance(me, user) <= proximityRadius;
    if (near) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(46, 207, 125, 0.8)";
      ctx.lineWidth = 2;
      ctx.arc(user.x, user.y, user.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawAvatar(user, false);
  });

  requestAnimationFrame(animate);
}

document.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  keys[event.key] = true;
  keys[key] = true;
});

document.addEventListener("keyup", event => {
  const key = event.key.toLowerCase();
  keys[event.key] = false;
  keys[key] = false;
});

animate();