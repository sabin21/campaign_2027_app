// 온도탑 3D (Three.js) — home.js에서 3D 사용 조건을 만족할 때만 동적으로 import 됨
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = './models/ondo_tower_baked_web.glb';

//-------------------------------------//
//-------------------------------------//
//Three.js 설정

const canvas = document.getElementById('main-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
const tower = new THREE.Group();
scene.add(tower);

// 바닥면 그림자
function groundShadow(radius){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128,128,0,128,128,128);
  grd.addColorStop(0,'rgba(58,42,34,0.3)'); grd.addColorStop(1,'rgba(58,42,34,0)');
  g.fillStyle = grd; g.fillRect(0,0,256,256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius*2, radius*2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI/2; m.position.y = 0.01;
  return m;
}

const FLOOR_COLOR_SCROLL = new THREE.Color('#FFE8D2');   // 스크롤 후 바닥 색
const pickRGB = (c) => ({ r: c.r, g: c.g, b: c.b });

// 바닥면 (눈 덮인 바닥, 가장자리는 투명하게 페이드)
function ground(radius){
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256,256,0,256,256,256);
  // #RRGGBBAA (마지막 2자리 = 투명도)
  grd.addColorStop(0,'#f8fafcff');
  grd.addColorStop(0.6,'#f0f4f8e6');
  grd.addColorStop(1,'#f0f4f800');
  g.fillStyle = grd; g.fillRect(0,0,512,512);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 64),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI/2;
  m.renderOrder = -1;   // 그림자보다 먼저 그려 겹침 깜빡임 방지
  return m;
}

// 눈 내리는 효과

function createSnow(r, center){
  const COUNT = 2500;
  const area = { x: r * 6, y: r * 3, z: r * 6 };
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  const phases = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++){
    positions[i*3]   = center.x + (Math.random() - 0.5) * area.x;
    positions[i*3+1] = Math.random() * area.y;
    positions[i*3+2] = center.z + (Math.random() - 0.5) * area.z;
    speeds[i] = r * (0.08 + Math.random() * 0.12);
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // 부드러운 원형 눈송이
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32,32,0,32,32,32);
  grd.addColorStop(0,'rgba(255,255,255,1)');
  grd.addColorStop(0.4,'rgba(255,255,255,0.8)');
  grd.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0,0,64,64);
  const tex = new THREE.CanvasTexture(c);

  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    map: tex, size: r * 0.025, sizeAttenuation: true,
    transparent: true, depthWrite: false, color: 0xffffff,
  }));
  scene.add(points);

  let t = 0;
  return function update(dt){
    t += dt;
    const p = geo.attributes.position.array;
    for (let i = 0; i < COUNT; i++){
      p[i*3+1] -= speeds[i] * dt;
      p[i*3]   += Math.sin(t * 0.8 + phases[i]) * r * 0.02 * dt;   // 좌우로 살랑
      p[i*3+2] += Math.cos(t * 0.6 + phases[i]) * r * 0.015 * dt;
      if (p[i*3+1] < 0) p[i*3+1] += area.y;
    }
    geo.attributes.position.needsUpdate = true;
  };
}
let updateSnow = null;

// 간판 텍스트: "나눔온도" "{온도}도" ----//

const gauges = []; // Thermo_Red_Front / Back  (scale.y 0~1 = 0~100도)

const SIGN_FONT = '"Pretendard GOV","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
const SIGN_COLOR = '#1f9f37'; 
const signTexts = [];  // { ctx, tex, value }

function makeSignText(signMesh){
  signMesh.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(signMesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const out = Math.sign(center.z) || 1;            // 탑 바깥쪽(+Z 정면 / -Z 뒷면)

  const W = 1024, H = Math.round(W * size.y / size.x);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x, size.y),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
  );
  mesh.position.set(center.x, center.y, center.z + out * (size.z / 2 + 0.003));
  if (out < 0) mesh.rotation.y = Math.PI;
  tower.add(mesh);

  const item = { ctx, tex, W, H, value: null };
  signTexts.push(item);
  return item;
}

function fitFont(ctx, text, maxW, maxH){
  let px = maxH;
  ctx.font = `800 ${px}px ${SIGN_FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) px = Math.floor(px * maxW / w);
  ctx.font = `800 ${px}px ${SIGN_FONT}`;
}

function drawSign(item, value){
  if (item.value === value) return;
  item.value = value;
  const { ctx, W, H } = item;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxW = W * 0.8;
  // 윗줄
  fitFont(ctx, '나눔온도', maxW, H * 0.30);
  ctx.fillStyle = SIGN_COLOR;
  ctx.fillText('나눔온도', W / 2, H * 0.29);

  // 아랫줄 (숫자는 게이지와 연동)
  fitFont(ctx, '100.0도', maxW, H * 0.38);     // 글자 크기는 '100.0도' 기준으로 고정
  const fullW = ctx.measureText('100.0도').width;
  const unitW = ctx.measureText('도').width;
  const unitX = W / 2 + fullW / 2 - unitW;     // '도' 왼쪽 끝 x (고정)
  const y2 = H * 0.7;
  ctx.fillStyle = SIGN_COLOR;
  ctx.textAlign = 'left';
  ctx.fillText('도', unitX, y2);
  ctx.textAlign = 'right';
  ctx.fillText(value.toFixed(1), unitX, y2);
  item.tex.needsUpdate = true;
}
let targetTemp = 0.5, currentTemp = 0.5;

// 카메라 상태: 타임라인의 인트로 구간은 basePos/lookTarget을, 스크롤 구간은 scrollCam을 움직이고 렌더 루프에서 합성
const basePos = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const scrollCam = {
  zoom: 0,    // 0~1, 탑까지 거리를 이 비율만큼 줄임
  angle: 0,   // 탑 중심 기준 Y축 회전 (rad)
  shift: 0,   // 화면상 탑 위치를 오른쪽으로 미는 비율 (화면 폭 기준)
  lift: 0,    // 화면상 탑 위치를 위로 올리는 비율 (화면 높이 기준)
};
const camOffset = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function updateCamera(){
  camOffset.subVectors(basePos, lookTarget)
    .multiplyScalar(1 - scrollCam.zoom)
    .applyAxisAngle(Y_AXIS, scrollCam.angle);
  camera.position.addVectors(lookTarget, camOffset);
  camera.lookAt(lookTarget);
  // 투영 영역만 옮겨 원근 왜곡 없이 탑을 화면 오른쪽·위로 보냄 (aspect도 함께 설정됨)
  const w = window.innerWidth, h = window.innerHeight;
  camera.setViewOffset(w, h, -w * scrollCam.shift, h * scrollCam.lift, w, h);
}

// 온도탑 온도 설정 (0 ~ 100도). 시작은 0도
export function setTemp(v){ targetTemp = Math.min(100, Math.max(0, v)) / 100; }
setTemp(0);
currentTemp = targetTemp;

// 모델 로드 → 장면 구성 후 resolve. tl에 넣을 3D 트윈(인트로 / 스크롤)을 함께 넘겨줌
export function loadTower({ onProgress } = {}){
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(MODEL_URL, (gltf) => {
      const model = gltf.scene;
      tower.add(model);

      const signs = [];
      model.traverse((o) => {
        if (o.name.startsWith('Thermo_Red')) gauges.push(o);
        if (o.name === 'Tower_Sign_Front' || o.name === 'Tower_Sign_Back') signs.push(o);
      });
      model.updateMatrixWorld(true);
      signs.forEach(makeSignText);

      // 카메라 맞추기
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const r = Math.max(size.x, size.y, size.z);
      const floor = ground(r * 5);
      floor.position.set(center.x, 0, center.z);
      scene.add(floor);
      scene.add(groundShadow(Math.max(size.x, size.z) * 0.9));
      updateSnow = createSnow(r, center);

      // 회전축을 탑 중심(x, z)으로 이동 — 월드 좌표는 그대로 유지
      tower.position.set(center.x, 0, center.z);
      tower.children.forEach((c) => { c.position.x -= center.x; c.position.z -= center.z; });

      // 시작: 탑 바로 위 (z를 살짝 띄워 lookAt이 정확히 수직이 되며 뒤집히는 것을 방지)
      lookTarget.set(center.x, center.y, center.z);
      basePos.set(center.x, center.y + r * 2.5, center.z + r * 0.1);

      // 웹폰트가 늦게 로드되는 경우를 대비해 폰트 준비 후 한 번 더 그림
      // 캔버스 글자는 DOM에 없어 브라우저가 서브셋 폰트를 받지 않으므로, 필요한 굵기·글자를 직접 로드
      document.fonts?.load(`800 64px ${SIGN_FONT}`, '나눔온도0123456789.도')
        .then(() => signTexts.forEach((t) => { t.value = null; }));

      startRenderLoop();

      resolve({
        // 인트로: 위 → 탑 정면(+Z), 이어서 탑 회전 (0 ~ 4초)
        addIntroTweens(tl){
          tl
            .to(basePos, { x: center.x, y: center.y - 2 , z: center.z + r * 2.2 }, 0)
            .to(lookTarget, { y: center.y + 0.2 }, 0)
            .to(tower.rotation, { y: Math.PI * 2.1, duration: 2, ease: 'power1.inOut' }, 2);
        },
        // 스크롤 구간: 카메라를 당기고 돌려 탑을 화면 오른쪽 위로
        addScrollTweens(tl, at){
          tl.to(scrollCam, {
            zoom: 0.45, angle: THREE.MathUtils.degToRad(35), shift: 0.30, lift: 0.16,
            duration: 1, ease: 'none',
          }, at);
        },
      });
    }, (e) => {
      if (e.total) onProgress?.(e.loaded / e.total);
    }, reject);
  });
}

// resize event ------------------- //

function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 45 : 35;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// 에니메이션 루프
function startRenderLoop(){
  let prevTime = null;
  renderer.setAnimationLoop((time) => {
    const dt = prevTime === null ? 0 : Math.min((time - prevTime) / 1000, 0.05);
    prevTime = time;
    const k = 1 - Math.exp(-dt * 6);

    currentTemp += (targetTemp - currentTemp) * k;
    if (Math.abs(targetTemp - currentTemp) < 0.0005) currentTemp = targetTemp;
    for (const g of gauges) g.scale.y = Math.max(currentTemp, 0.0001);
    const shown = Math.round(currentTemp * 1000) / 10;   // 0.1도 단위
    for (const t of signTexts) drawSign(t, shown);
    updateSnow?.(dt);

    updateCamera();
    renderer.render(scene, camera);
  });
}
