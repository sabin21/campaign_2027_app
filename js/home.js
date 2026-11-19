import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

// 새로고침 시 브라우저가 이전 스크롤 위치를 복원하지 않고 항상 맨 위에서 시작
ScrollTrigger.clearScrollMemory('manual');   // history.scrollRestoration = 'manual' 포함
window.scrollTo(0, 0);

// 모바일 기기 판단: 화면 폭 1280px 이하 (페이지 로드 시 한 번만 판단)
// → 3D, 인트로, ScrollTrigger, Lenis 모두 사용하지 않음
const MOBILE_MAX_WIDTH = 1280;
const isMobile = window.innerWidth <= MOBILE_MAX_WIDTH;
if (isMobile) document.body.classList.add('is-mobile');   // CSS 분기용

// 부드러운 스크롤 (데스크톱만): GSAP ticker로 Lenis를 구동하고 스크롤마다 ScrollTrigger 갱신
let lenis = null;
if (!isMobile){
  lenis = new Lenis();
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

// 버튼 스크롤 이동: 데스크톱은 Lenis, 모바일은 브라우저 기본 부드러운 스크롤
function scrollToY(y){
  if (lenis) lenis.scrollTo(y, { duration: 1.2 });
  else window.scrollTo({ top: y, behavior: 'smooth' });
}

//-------------------------------------//
//-------------------------------------//
// 3D 사용 여부 판단
// 아래 중 하나라도 해당하면 #main-canvas를 삭제하고 three.js 코드를 불러오지 않음
//  - body에 class "test"가 있음
//  - 브라우저 GPU(하드웨어) 가속이 꺼져 있음
//  - 모바일 기기 (화면 폭 1280px 이하) → 인트로 모션도 생략


// GPU 가속 확인: 하드웨어 가속이 꺼져 있으면 WebGL을 아예 못 만들거나,
// failIfMajorPerformanceCaveat 옵션에서 실패하거나, 소프트웨어 렌더러(SwiftShader 등)로 잡힘
function hasGpuAcceleration(){
  try {
    const c = document.createElement('canvas');
    const opts = { failIfMajorPerformanceCaveat: true };
    const gl = c.getContext('webgl2', opts) || c.getContext('webgl', opts);
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();   // 확인용 컨텍스트 즉시 반환
    return !/swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(name);
  } catch {
    return false;
  }
}

const use3D = !document.body.classList.contains('test')
  && !isMobile
  && hasGpuAcceleration();

const loadingEl = document.getElementById('loading');
const pctEl = document.getElementById('pct');

let tower3D = null;   // 3D 사용 시 tower3d.js 모듈
let tower = null;     // 3D 사용 시 로드된 온도탑 (인트로/스크롤 트윈 제공)

// 3D: three.js 모듈을 그때 불러와 모델 로드 후 타임라인 시작 / 2D: 캔버스 삭제 후 바로 시작
async function init(){
  if (!use3D){
    document.getElementById('main-canvas')?.remove();
    document.body.classList.add('no-3d');   // CSS에서 2D 대체 화면 분기용
    loadingEl?.remove();
    startTimeline();
    return;
  }
  // 3D 사용 시: 2D 대체 화면 숨김
  const alterCanvas = document.querySelector('.alter-canvas');
  if (alterCanvas) alterCanvas.style.display = 'none';
  try {
    tower3D = await import('./tower3d.js');
    tower = await tower3D.loadTower({
      onProgress: (p) => { if (pctEl) pctEl.textContent = Math.round(p * 100) + '%'; },
    });
  } catch (err){
    console.error(err);
    loadingEl?.classList.add('err');
    if (loadingEl) loadingEl.innerHTML = '모델을 불러오지 못했습니다.<br>파일을 직접 열지 말고 로컬 서버로 실행해 주세요.<br>(예: 이 폴더에서 <code>python -m http.server</code>)';
    return;
  }
  loadingEl?.remove();
  startTimeline();
}

//-------------------------------------//
// 타임라인: [0 ~ 'intro'] 인트로 → ['intro' ~ 끝] section-2 스크롤 구간
// 3D가 있으면 카메라 이동(0~2초) 뒤에 DOM 등장, 없으면 DOM 등장만 바로 재생

let sceneTrigger = null;   // section-2 스크롤 구간 ScrollTrigger (인트로 종료 후 생성)

function startTimeline(){
  // 모바일(1280px 이하): 타임라인·ScrollTrigger를 만들지 않음 → 요소에 GSAP transform이 전혀 들어가지 않음
  // (CSS만으로 레이아웃 제어. 숫자 카운트업은 요소 위치와 무관하므로 그대로 실행)
  if (isMobile){
    countUpTotalPanel();
    return;
  }

  const tl = gsap.timeline({ paused: true, defaults: { duration: 3, ease: 'power2.inOut' } });
  const domAt = tower ? 2 : 0;   // DOM 인트로 시작 시각

  tower?.addIntroTweens(tl);
  tl
    .fromTo('.btn-donate', { y: 500}, {y:0, duration: 0.8}, domAt)
    .fromTo('.hero-copy-wrap', { y: "-80vh"}, {y:0, duration: 0.8}, domAt)
    .fromTo('.model-pict', { x: "50vw"}, {x:0, duration: 0.8}, domAt + 0.5)
    .fromTo('#hero-content-1', { x: "50vw"}, {x:0, duration: 0.8}, domAt + 1)
    .addLabel('intro', tower ? undefined : domAt + 1.8);   // 3D 없으면 마지막 DOM 트윈 종료 시점

  tower?.addScrollTweens(tl, 'intro');
  tl
    .to('.model-pict', { x: "50vw", duration: 0.8}, 'intro')
    .to('#hero-content-1', { x: "50vw", duration: 0.8}, 'intro')
    .to('.hero-copy-wrap', { y: "-80vh", duration: 0.8}, 'intro')
    .fromTo('.tower-2d', { scale: 0.8, x: 0 }, { scale: 1.5, x: "26vw", duration: 1, ease: 'none' }, 'intro')
    .fromTo('.local-map-title', { x: "-50vw"}, {x:0, duration: 0.8},'intro')
    .fromTo('.local-data-panel', { x: "-50vw"}, {x:0, duration: 0.8}, 'intro')
    .fromTo('.map-wrap', { x: "-80vw"}, {x:0, duration: 0.8}, 'intro')
    ;

  const introEnd = tl.labels.intro;
  const scrollLen = tl.duration() - introEnd;

  // 인트로 종료 후: 숫자 반영 + 스크롤이 타임라인의 스크롤 구간을 제어
  const afterIntro = () => {
    countUpTotalPanel();             // 인트로 종료 → 패널 숫자 + 온도탑(선택 지역 온도) 반영
    const seek = (progress) => gsap.to(tl, {
      time: introEnd + progress * scrollLen,
      duration: 1, ease: 'power1.out', overwrite: true,   // scrub: 1 과 같은 부드러운 추종
    });
    const st = sceneTrigger = ScrollTrigger.create({
      trigger: '.section-2',
      start: 'top bottom',
      end: '+=200',
      onUpdate: (self) => seek(self.progress),
    });
    seek(st.progress);   // 스크롤된 상태로 리로드한 경우 현재 위치까지 이어서 이동
  };

  // 인트로는 시간으로 재생하고, 끝난 뒤부터 스크롤이 제어
  tl.tweenTo('intro', { onComplete: afterIntro });
}

// '지역별 현황보기' 버튼: 스크롤 구간이 끝나는 위치(지도 화면)로 부드럽게 이동
// 인트로 도중이라 ScrollTrigger가 아직 없으면 같은 기준(section-2 top이 화면 bottom + 200px)으로 계산
document.querySelector('.btn-goto-down')?.addEventListener('click', () => {
  const section2 = document.querySelector('.section-2');
  if (isMobile){   // 모바일: ScrollTrigger가 없으므로 section-2 위치로 바로 이동
    if (section2) scrollToY(section2.getBoundingClientRect().top + window.scrollY);
    return;
  }
  const target = sceneTrigger
    ? sceneTrigger.end
    : section2 && section2.getBoundingClientRect().top + window.scrollY - window.innerHeight + 200;
  if (target != null) scrollToY(target);
});

// 뒤로가기 버튼: 맨 위(scrollY 0)로 부드럽게 이동 → 스크롤 구간 애니메이션도 처음 상태로 되돌아감
document.querySelector('.btn-goto-back')?.addEventListener('click', () => {
  scrollToY(0);
});

//----------------------------------------- //
//----------------------------------------- //
// 온도,모금액 Data 연동

// 목표값: HTML의 window.TOTAL_DATA.temp (없거나 숫자가 아니면 50도)
// 시작은 0도, 인트로 애니메이션이 끝나면 목표값으로 올라감 (tl.tweenTo('intro') onComplete)
const totalTemp = Number(window.TOTAL_DATA?.temp);
const initialTemp = Number.isFinite(totalTemp) ? totalTemp : 50;

// 지역 지도: path 클릭 시 window.REGION_DATA의 해당 지역 데이터를 패널에 표시
const koreaMap = document.getElementById('korea-map');
const localRegionEl = document.getElementById('local-region-kor');
const localTempEl = document.getElementById('local-temp');
const localAmountEl = document.getElementById('local-amount');
const amountFormat = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// 상단 패널(전국): 0에서 window.TOTAL_DATA의 temp / amount 값까지 카운트업
const panelTotalTempEl = document.getElementById('panel-total-temp');
const tower2dTempEl = document.getElementById('tower2d-temp-value');   // 2D 온도탑 간판 숫자 (패널 온도와 함께 변함)
const panelTotalAmountEl = document.getElementById('panel-total-amount');
const tower2dGaugeEl = document.querySelector('.tower-gauge');   // 2D 온도탑 게이지 (0~100도 → 0~310px)
const GAUGE_MAX_HEIGHT = 310;

// 표시 데이터(온도탑 3D/2D + 패널 온도·모금액): 기본은 중앙회(TOTAL_DATA), 상단 드랍다운에서 지역 선택 시 해당 지역 값
const totalAmountRaw = Number(window.TOTAL_DATA?.amount);
const initialAmount = Number.isFinite(totalAmountRaw) ? totalAmountRaw : 0;
let towerTemp = initialTemp;
let panelAmount = initialAmount;
let towerTempReady = false;   // 인트로 종료(숫자 반영 시점) 이후 true → 그 전에 선택하면 값만 저장
const tower2dCounter = { temp: 0 };
const amountCounter = { amount: 0 };

function renderTower2D(){
  const t = tower2dCounter.temp;
  const tempText = t.toFixed(1);
  if (tower2dTempEl) tower2dTempEl.textContent = tempText;
  if (panelTotalTempEl) panelTotalTempEl.textContent = tempText;   // 패널 '현재 나눔온도'도 같은 값
  if (tower2dGaugeEl) tower2dGaugeEl.style.height = (Math.min(100, Math.max(0, t)) / 100 * GAUGE_MAX_HEIGHT) + 'px';
}

function renderAmount(){
  if (panelTotalAmountEl) panelTotalAmountEl.textContent = amountFormat.format(amountCounter.amount);   // 억원 단위
}

// 현재 값에서 towerTemp / panelAmount 로 카운트업
// (3D: 게이지·간판, 2D: 간판 숫자·게이지, 패널: 현재 나눔온도·모금액)
function applyTowerData(){
  tower3D?.setTemp(towerTemp);
  gsap.to(tower2dCounter, {
    temp: towerTemp, duration: 1.5, ease: 'power2.out',
    overwrite: true, onUpdate: renderTower2D,
  });
  gsap.to(amountCounter, {
    amount: panelAmount, duration: 1.5, ease: 'power2.out',
    overwrite: true, onUpdate: renderAmount,
  });
}

function setTowerData(temp, amount){
  if (Number.isFinite(temp)) towerTemp = temp;
  if (Number.isFinite(amount)) panelAmount = amount;
  if (towerTempReady) applyTowerData();
}

function countUpTotalPanel(){
  towerTempReady = true;
  applyTowerData();
}

function selectRegion(path){
  const data = window.REGION_DATA?.[path.dataset.region];
  if (!data) return;
  koreaMap.querySelector('path.active')?.classList.remove('active');
  path.classList.add('active');
  localRegionEl.textContent = data.name;
  localTempEl.textContent = data.temp.toFixed(1);
  localAmountEl.textContent = amountFormat.format(data.amount);   // 억원 단위
}

koreaMap?.addEventListener('click', (e) => {
  const path = e.target.closest('path[data-region]');
  if (path) selectRegion(path);
});

// 초기 표시: 서울
const initialRegion = koreaMap?.querySelector('path[data-region="seoul"]');
if (initialRegion) selectRegion(initialRegion);

// 상단 지역 드랍다운: 기본값 '중앙회' + window.REGION_DATA의 17개 지역
// 선택 시 document에 'region-dropdown-change' 이벤트 발생 (detail.key: 'total' 또는 지역 키)
const regionDropdown = document.getElementById('region-dropdown');
if (regionDropdown){
  const toggleBtn = regionDropdown.querySelector('.btn-region-toggle');
  const labelEl = document.getElementById('region-dropdown-label');
  const listEl = document.getElementById('region-dropdown-list');
  const options = [
    { key: 'total', name: window.TOTAL_DATA?.name || '중앙회' },
    ...Object.entries(window.REGION_DATA || {}).map(([key, d]) => ({ key, name: d.name })),
  ];

  listEl.innerHTML = options.map((o, i) =>
    // 지역명 뒤에 '지회' 표시 (중앙회 제외)
    `<li role="option" data-key="${o.key}"${i === 0 ? ' class="selected" aria-selected="true"' : ''}>${o.name}${o.key === 'total' ? '' : '지회'}</li>`
  ).join('');
  labelEl.textContent = options[0].name;

  const setOpen = (open) => {
    regionDropdown.classList.toggle('open', open);
    toggleBtn.setAttribute('aria-expanded', String(open));
  };

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!regionDropdown.classList.contains('open'));
  });

  listEl.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-key]');
    if (!li) return;
    listEl.querySelector('li.selected')?.removeAttribute('aria-selected');
    listEl.querySelector('li.selected')?.classList.remove('selected');
    li.classList.add('selected');
    li.setAttribute('aria-selected', 'true');
    labelEl.textContent = li.textContent;   // 버튼 라벨도 목록과 동일 ('서울지회', 중앙회는 그대로)
    setOpen(false);
    // 선택 지역 온도·모금액을 온도탑/패널에 적용 (중앙회 = TOTAL_DATA)
    const key = li.dataset.key;
    const region = window.REGION_DATA?.[key];
    if (key === 'total') setTowerData(initialTemp, initialAmount);
    else setTowerData(Number(region?.temp), Number(region?.amount));
    // 모금액 패널 제목: 중앙회 = '전국 모금액', 지역 = '{지역} 모금액'
    const amountTitle = document.querySelector('.panel-amount .title');
    if (amountTitle) amountTitle.textContent = `${key === 'total' ? '전국' : region?.name} 모금액`;
    // 지회 헤드 이미지 교체: head_{지역키}.png (중앙회 = head_center.png)
    // 지회 배너 이미지 교체: banner_{지역키}.png (중앙회 = banner_center.png)
    const imgKey = key === 'total' ? 'center' : key;
    const branchHead = document.getElementById('branch-head');
    if (branchHead) branchHead.src = `./img/head_${imgKey}.png`;
    const bannerBranch = document.getElementById('banner-branch');
    if (bannerBranch) bannerBranch.src = `./img/banner_${imgKey}.png`;
    // 아래 지역 지도도 같은 지역을 활성화 (중앙회 선택 시 초기값인 서울로 복귀)
    const mapKey = key === 'total' ? 'seoul' : key;
    const mapPath = koreaMap?.querySelector(`path[data-region="${mapKey}"]`);
    if (mapPath) selectRegion(mapPath);
    document.dispatchEvent(new CustomEvent('region-dropdown-change', { detail: { key } }));
  });

  document.addEventListener('click', (e) => {
    if (!regionDropdown.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
}

init();
