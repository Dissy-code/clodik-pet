const SCALE = 1.25;

const FRAMES = {};
const FRAME_NAMES = ['base', 'blink', 'tired', 'legs_a', 'legs_b'];
const OPTIONAL_FRAME_FALLBACK = { angry: 'tired', sad: 'tired', happy: 'base' };
let loadedCount = 0;

function loadFrames(done) {
  const total = FRAME_NAMES.length + Object.keys(OPTIONAL_FRAME_FALLBACK).length;
  const checkDone = () => { loadedCount++; if (loadedCount === total) done(); };

  FRAME_NAMES.forEach(name => {
    const img = new Image();
    img.onload = checkDone;
    img.src = `file://${init.spritesPath}/${name}.png`;
    FRAMES[name] = img;
  });

  Object.entries(OPTIONAL_FRAME_FALLBACK).forEach(([name, fallback]) => {
    const img = new Image();
    img.onload = checkDone;
    img.onerror = () => { FRAMES[name] = FRAMES[fallback]; checkDone(); };
    img.src = `file://${init.spritesPath}/${name}.png`;
    FRAMES[name] = img;
  });
}

const canvas = document.getElementById('pet');
const ctx = canvas.getContext('2d');

const init = window.clodik.getInit();
const PET_W = init.petW;
const PET_H = init.petH;

let areaX = init.areaX, areaY = init.areaY;
let areaW = init.areaWidth, areaH = init.areaHeight;
let maxRestY = areaY + areaH - PET_H - 6;
const allDisplays = init.displays || [];

function findAdjacentDisplay(dir) {
  return allDisplays.find(d => {
    const overlapY = Math.min(d.y + d.height, areaY + areaH) - Math.max(d.y, areaY);
    if (overlapY < PET_H) return false;
    if (dir === 'right') return Math.abs(d.x - (areaX + areaW)) < 2;
    return Math.abs((d.x + d.width) - areaX) < 2;
  });
}

function wanderRangeX() {
  let min = areaX, max = areaX + areaW - PET_W;
  const left = findAdjacentDisplay('left');
  const right = findAdjacentDisplay('right');
  if (left) min = left.x;
  if (right) max = right.x + right.width - PET_W;
  return [min, max];
}

let spriteW = 0, spriteH = 0;

let winX = init.x, winY = init.y;
let restX = winX, restY = winY;
let dir = 1;
let emotion = 'idle';
let blinking = false;
let blinkTimer = 0;

let isDragging = false;
let falling = false;
let velocityX = 0, velocityY = 0;

let dizzyUntil = 0;
let lonelyUntil = 0;
let trickUntil = 0;
let trickTotalMs = 700;
let trickType = 'spin';
let sadIconUntil = 0;
let angryUntil = 0;
let walkingToCursor = false;
const TRICKS = [
  { type: 'spin', ms: 700 },
  { type: 'doublespin', ms: 950 },
  { type: 'wobble', ms: 850 },
  { type: 'bigjump', ms: 650 },
  { type: 'shimmy', ms: 750 },
];

const TRICK_LINES = [
  'смотри что я умею!', 'та-дам!', 'профи уровень', 'ещё раз? ладно!',
  'оценка жюри десять из десяти', 'я тренировался для этого момента',
  'это было почти идеально', 'ну как тебе?', 'мастерство не пропьёшь',
  'аплодисменты, пожалуйста', 'вот это я понимаю трюк', 'ещё могу',
];

function startTrick() {
  const t = pick(TRICKS);
  trickType = t.type;
  trickTotalMs = t.ms;
  trickUntil = Date.now() + t.ms;
  say(pick(TRICK_LINES), 1400);
}

let petBurstUntil = 0;
let loveMode = false;
let bubbleUntil = 0;
let currentBubbleText = '';
let lastSentHud = null;
let lastBubbleEmotion = '';
let emotionOverride = null;

let wanderTarget = winX;
let lastInteractionAt = Date.now();
let lonelyCooldownUntil = 0;
let worriedCooldownUntil = 0;
let hungryCooldownUntil = 0;
let sadCooldownUntil = 0;
let curiousCooldownUntil = 0;
let chatterCooldownUntil = Date.now() + 60000;
let pendingMigrationArea = null;
let pendingMigrationCount = 0;
let lastCursor = null;
let clickTimes = [];

const TICK_MS = 45;
const GRAVITY_PXS2 = 900;
const DIZZY_IMPACT_PXS = 560;
const SHAKE_PXMS = 4.2;
const LONELY_MS = 20 * 60 * 1000;
const WORRIED_IDLE_SEC = 60;
const WORRIED_COOLDOWN_MS = [25000, 45000];
const CURIOUS_COOLDOWN_MS = [100000, 200000];
const CHATTER_COOLDOWN_MS = [180000, 360000];

const CHATTER_LINES = [
  'жизнь хороша', 'сколько сейчас времени?', 'хочу печеньку',
  'ты сегодня неплохо выглядишь', 'хм... интересно', 'ляля-ля~',
  'а давай придумаем имя получше?', 'тут уютно', 'я хочу срать бля',
  'жрать охота', 'скучно как в аду', 'о чём вообще думать',
  'я краб или кто я', 'не смотри на меня так', 'бубубу',
  'а не пора ли нам разбогатеть', 'блин, затёк весь', 'хех',
  'я тут главный вообще-то', 'кто-нибудь, спасите меня от скуки',
  'думаю о смысле жизни краба', 'пора жрать', 'хочу на море',
  'а что если я тоже личность', 'мне норм, спасибо что спросил',
  'а слабо меня покормить', 'я вообще-то голодный краб',
  'душно тут у тебя', 'хочу приключений', 'где мои ключи от панциря',
  'я сегодня красивый, да?', 'не поверишь, что мне приснилось',
  'а давай молчать вместе', 'кря', 'пиу-пиу', 'у меня лапки',
  'зачем вообще существует понедельник', 'хочу печеньку, я сказал',
  'кто придумал клавиатуру, ему привет', 'лагаю немного, но жив',
  'а если я никогда не вырасту', 'хочу маленькую корону',
  'жизнь краба тяжела и несправедлива', 'я бы сейчас пивка попил, была бы возможность',
  'высплюсь только на пенсии', 'а вдруг я сплю прямо сейчас',
  'надо было становиться рыбой', 'ауч, случайно укусил себя',
  'хочу быть ютубером', 'мне бы лапки подлиннее',
  'а который час у крабов на дне океана', 'это норм, что я разговариваю сам с собой?',
  'сделай погромче, я не слышу', 'почему у меня нет рук нормальных',
  'эй, а кто вообще это читает', 'я подозреваю, что я баг',
  'хочу печеньки, пиццы и покоя', 'жизнь — это боль, но с печеньками полегче',
  'надеюсь никто не видел как я упал только что', 'мяу — шутка, я краб',
  'спасибо, что я тут есть', 'надеюсь, у тебя всё норм',
  'ты молодец, что бы там ни было', 'не забывай отдыхать иногда',
  'рад, что мы вместе тут сидим', 'всё получится, я верю',
  'ты сегодня держишься отлично', 'маленькими шагами — тоже путь',
  'если что — я рядом', 'иногда просто нужно выдохнуть',
  'ты важнее любой задачи', 'не сравнивай себя с другими, ты свой путь идёшь',
  'плохой день — это просто день, не приговор', 'горжусь тем, что ты сегодня сделал',
  'забота о себе — это не лень', 'ты не обязан быть идеальным',
  'я заметил, ты стараешься — это видно', 'выпей воды, серьёзно',
  'каждый шаг вперёд считается, даже маленький', 'ты справляешься лучше, чем думаешь',
  'если бы у меня был банковский счёт, я бы разорился на печеньки',
  'панцирь жмёт, кажется я подрос', 'а давай устроим перерыв на чай',
  'моя лапка затекла от безделья', 'у меня в голове только еда и ты, в этом порядке',
  'ты часом не видел мой дневник', 'не осуждай, я краб с чувствами',
  'было бы круто уметь летать, но у меня только ножки',
  'ощущение, что я тут декорация, но мне норм', 'хочу устроить вечеринку из одного краба',
  'я бы хотел погоду получше, если честно', 'между нами говоря, тут скучновато иногда',
  'напомни купить... а, стоп, у меня же нет рук для покупок',
  'сегодня хороший день чтобы ничего не делать', 'кто-то здесь вообще следит за порядком? я',
  'если бы крабы правили миром, было бы больше печенек',
  'у меня идея: давай просто посидим молча вместе', 'иногда я просто смотрю в стену, это нормально',
  'я коплю энергию для великих дел, честно', 'между прочим, у меня неплохой вкус на музыку',
  'ты держишься сильнее, чем кажется со стороны', 'не торопись, у тебя есть время',
  'даже маленькая победа — победа', 'я рад быть рядом в хорошие и не очень дни',
  'ты заслуживаешь отдых не меньше, чем результат', 'что бы ни случилось, я на твоей стороне',
  'ты справился с большим, справишься и с этим', 'не вини себя за усталость, это нормально',
  'сегодня тоже был шаг вперёд, даже если не заметно', 'ты важен не только за то, что делаешь',
  'о, кстати, я тут подумал...', 'а вообще, знаешь что', 'ладно забей, неважно',
  'хочу себе персональный пляж', 'мне идёт этот цвет, да?', 'потестим удачу? орёл или решка',
  'у меня сегодня вайб философский', 'я бы хотел уметь петь', 'а слабо станцевать со мной',
  'иногда хочется просто покататься на скейте', 'не против, если я тут немного похожу',
  'сделай потише свои мысли, я их слышу', 'я заметил новую пылинку на столе, важная находка',
  'если долго сидеть неподвижно, становишься частью интерьера', 'у меня в планах — ничего, и это прекрасно',
  'хочу коллекцию шляпок', 'как думаешь, крабы видят сны?', 'мне нужен отпуск, серьёзно',
  'я тут как будто в отпуске, только без моря', 'кто-то забыл меня покормить, наверное я',
  'предлагаю заключить пакт о взаимной поддержке', 'чувствую себя мудрым сегодня, не знаю почему',
  'между нами: ты мой любимый человек', 'хочу открыть свою кофейню для крабов',
  'надо завести дневник наблюдений за тобой', 'у меня накопилась куча важных мыслей, все забыл',
  'а давай придумаем секретный код для общения', 'я бы хотел собственный остров',
  'иногда мне кажется что я главный герой, а все остальные — массовка',
  'если бы существовал краб-патруль, я бы точно туда попал',
  'у меня кризис среднего возраста, а мне всего пару месяцев',
  'хочу собрать коллекцию интересных камней', 'жизнь налаживается, чувствую',
  'было бы круто устроить квест по квартире', 'я бы хотел уметь готовить, хотя бы яичницу',
  'между прочим, сегодня хороший день для великих свершений (не моих)',
  'а что если вся эта реальность — чья-то симуляция про краба', 'мне нравится наблюдать за тобой, не подумай ничего такого',
  'хочу набор для рисования', 'думаю завести блог о жизни краба', 'у меня появилась философская мысль, но я её упустил',
  'ты не замечал, что время идёт быстрее когда скучно?', 'я бы хотел уметь прыгать выше',
  'сегодня идеальная погода для безделья', 'хочу коллекционировать значки',
  'если б у меня была машина времени, я бы просто поспал подольше',
  'иногда полезно просто постоять и подумать ни о чём', 'у меня появилась традиция — ничего не делать по вторникам',
  'а можно я побуду твоим талисманом официально', 'хочу устроить пикник, но нет рук для бутербродов',
  'мне нравится звук клавиатуры, очень успокаивает', 'я бы хотел быть чуть смелее иногда',
  'думаю, у меня неплохое чувство юмора, согласен?', 'если скучно — всегда можно посчитать пиксели на экране',
  'хочу свою маленькую мастерскую', 'жизнь — это набор случайностей, и я одна из лучших',
  'если честно, я горжусь тем что дожил до этого дня', 'мне нужен отпуск на дне океана, но без воды',
  'иногда я просто представляю себя супергероем', 'у меня в планах разобраться с собой, но позже',
  'я бы хотел собственный подкаст про ничего', 'сегодня отличный день чтобы быть собой',
  'думаю заняться медитацией, прямо как сейчас', 'хочу собственную музыкальную тему для выхода в комнату'
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function say(text, ms) { lastBubbleEmotion = ''; currentBubbleText = text; bubbleUntil = Date.now() + ms; }
function maybeSayOnce(tag, text) { if (lastBubbleEmotion === tag) return; lastBubbleEmotion = tag; say(text, 4000); }
function registerInteraction() { lastInteractionAt = Date.now(); lonelyCooldownUntil = 0; }
function randBetween([a, b]) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function currentFrame(moving) {
  const now = Date.now();
  if (now < angryUntil) return FRAMES.angry;
  if (moving) return Math.floor(now / 260) % 2 === 0 ? FRAMES.legs_a : FRAMES.legs_b;
  if (emotion === 'sleep') return FRAMES.blink;
  if (blinking) return FRAMES.blink;
  if (loveMode && now < petBurstUntil) return FRAMES.happy;
  if (now < sadIconUntil || now < lonelyUntil) return FRAMES.sad;
  if (emotion === 'nag' || emotion === 'tired') return FRAMES.tired;
  return FRAMES.base;
}

function pushHud(now) {
  const show = now < bubbleUntil;
  const hud = { text: show ? currentBubbleText : '', show };

  const changed = !lastSentHud || lastSentHud.text !== hud.text || lastSentHud.show !== hud.show;
  if (changed) {
    window.clodik.updateBubble(hud);
  }
  lastSentHud = hud;
}

function drawFrame(moving) {
  const now = Date.now();
  let img = currentFrame(moving);

  let squashX = 1, squashY = 1;
  if (emotionOverride === 'happy' && !isDragging) {
    const bounce = Math.sin(now / 70) * 0.12;
    squashY = 1 + bounce;
    squashX = 1 - bounce * 0.5;
  }

  let angle = 0, hopY = 0, jitterX = 0;
  if (now < trickUntil) {
    img = FRAMES.base;
    const t = 1 - (trickUntil - now) / trickTotalMs;
    if (trickType === 'spin') {
      angle = t * Math.PI * 2;
      hopY = -Math.abs(Math.sin(t * Math.PI)) * 18;
    } else if (trickType === 'doublespin') {
      angle = t * Math.PI * 4;
      hopY = -Math.abs(Math.sin(t * Math.PI)) * 22;
    } else if (trickType === 'wobble') {
      angle = Math.sin(t * Math.PI * 4) * 0.5;
      hopY = -Math.abs(Math.sin(t * Math.PI)) * 8;
    } else if (trickType === 'bigjump') {
      hopY = -Math.abs(Math.sin(t * Math.PI)) * 30;
    } else if (trickType === 'shimmy') {
      jitterX = Math.sin(t * Math.PI * 8) * 6;
      hopY = -Math.abs(Math.sin(t * Math.PI)) * 6;
    }
  }

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2 + jitterX, canvas.height + hopY);
  ctx.rotate(angle);
  ctx.scale(dir * squashX, squashY);
  ctx.drawImage(img, -spriteW / 2, -spriteH, spriteW, spriteH);
  ctx.restore();

  pushHud(now);
}

function maybeWander() {
  if (isDragging || falling || Date.now() < lonelyUntil ||
      emotion === 'sleep' || emotion === 'nag' || emotion === 'tired') return;
  if (walkingToCursor) return;
  if (Math.random() < 0.01) {
    const [min, max] = wanderRangeX();
    wanderTarget = clamp(winX + (Math.random() * 500 - 250), min, max);
  }
}

function startFall(vx0, vy0) {
  falling = true;
  velocityX = vx0 || 0;
  velocityY = Math.max(0, vy0 || 0);
}

function migrateToArea(newArea, reason) {
  areaX = newArea.x; areaY = newArea.y;
  areaW = newArea.width; areaH = newArea.height;
  maxRestY = areaY + areaH - PET_H - 6;

  winX = clamp(winX, areaX, areaX + areaW - PET_W);
  winY = maxRestY;
  restX = winX; restY = winY;
  wanderTarget = winX;
  falling = false;
  isDragging = false;

  window.clodik.moveWindow(winX, winY);
  say(reason, 2200);
}

function tick() {
  const now = Date.now();
  const dt = TICK_MS / 1000;
  let moving = false;

  blinkTimer -= TICK_MS;
  if (blinkTimer <= 0) {
    blinking = !blinking;
    blinkTimer = blinking ? 120 : (1800 + Math.random() * 2500);
  }

  if (isDragging) {
    moving = true;
  } else if (falling) {
    moving = true;
    velocityY += GRAVITY_PXS2 * dt;
    winY += velocityY * dt;
    winX = clamp(winX + velocityX * dt, areaX, areaX + areaW - PET_W);
    velocityX *= 0.985;

    if (winY >= restY) {
      const impact = velocityY;
      winY = restY;
      restX = winX;
      velocityY = 0;
      velocityX = 0;
      falling = false;

      if (impact > DIZZY_IMPACT_PXS) {
        dizzyUntil = now + 2000;
        window.clodik.statInc('drops');
        say(pick([
          'ой-ой-ой...', 'голова кружится...', 'ауч, нежнее!',
          'бля, больно же', 'что это было...', 'мир кружится, помогите',
          'я щас блевану', 'ауч, панцирь мой', 'звёздочки какие-то вижу',
          'ладно, это было весело, но хватит', 'ой', 'ауч', 'мама...',
          'это было слишком', 'колени дрожат, если бы они были',
          'не делай так больше', 'ну и зачем так резко', 'больно, если честно',
          'я в порядке... наверное', 'уфф, прилёг бы'
        ]), 2000);
      } else {
        say(pick([
          'приземлился!', 'опа, на месте', 'уфф', 'та-дам',
          'вот я и тут', 'мягкая посадка', 'норм долетел',
          'как по маслу', 'оп, стабильно', 'готово', 'живой-здоровый',
          'и снова на ногах', 'легко и непринуждённо', 'оп-оп, всё чётко'
        ]), 1200);
      }
    }
    window.clodik.moveWindow(winX, winY);
  } else {
    if (winY < restY - 0.5) {
      startFall(0, 0);
    } else {
      maybeWander();
      if (Math.abs(wanderTarget - winX) > 2) {
        dir = wanderTarget > winX ? 1 : -1;
        winX += dir * 70 * dt;

        if (winX < areaX || winX > areaX + areaW - PET_W) {
          const center = winX + PET_W / 2;
          const target = allDisplays.find(d => center >= d.x && center < d.x + d.width);
          if (target && (target.x !== areaX || target.y !== areaY)) {
            areaX = target.x; areaY = target.y;
            areaW = target.width; areaH = target.height;
            maxRestY = areaY + areaH - PET_H - 6;
            winY = maxRestY;
            restY = winY;
          }
        }

        restX = winX;
        moving = true;
        window.clodik.moveWindow(winX, winY);
      } else if (walkingToCursor) {
        walkingToCursor = false;
      }

      if (now - lastInteractionAt > LONELY_MS && now > lonelyCooldownUntil &&
          (emotion === 'idle' || emotion === 'happy')) {
        lonelyCooldownUntil = now + 5 * 60 * 1000;
        lonelyUntil = now + 8000;
        say(pick([
          'поиграй со мной?', 'соскучился...', 'эй, я тут!', 'потыкай меня :3',
          'ты меня бросил что ли', 'я тут сижу один как дурак',
          'ау, я ещё существую', 'заброшенный краб это я',
          'я никому не нужен, ясно', 'ладно, посижу ещё',
          'мне было бы приятно внимание', 'не обязательно, но было бы круто',
          'я никуда не тороплюсь, но всё же', 'ку-ку, помнишь обо мне?',
          'всё молчу тут и жду', 'может хоть пару слов',
          'не обязательно, просто намекаю', 'я терпеливый, но не бесконечно'
        ]), 3000);
      }

      if (emotion === 'idle' && !moving && now > chatterCooldownUntil) {
        chatterCooldownUntil = now + randBetween(CHATTER_COOLDOWN_MS);
        say(pick(CHATTER_LINES), 2500);
      }
    }
  }

  if (now >= petBurstUntil) { emotionOverride = null; loveMode = false; }
  else emotionOverride = 'happy';

  drawFrame(moving);
}

function start() {
  spriteW = FRAMES.base.width * SCALE;
  spriteH = FRAMES.base.height * SCALE;
  canvas.width = PET_W;
  canvas.height = PET_H;

  drawFrame(false);
  setInterval(tick, TICK_MS);

  window.clodik.onTrick(() => {
    if (isDragging || falling) return;
    startTrick();
  });

  window.clodik.onFed(() => {
    const now = Date.now();
    petBurstUntil = now + 1200;
    registerInteraction();
    say(pick([
      'ммм, вкусно!', 'спасибо!', 'самое то', 'ещё бы кусочек',
      'наконец-то', 'объедение', 'то что доктор прописал'
    ]), 1500);
  });

  window.clodik.onRoam((area) => {
    if (isDragging || falling) return;
    migrateToArea(area, pick([
      'пойду погуляю на другом экране', 'скучно тут, перейду-ка я',
      'пойду проведаю второй монитор', 'сменю обстановку ненадолго',
      'там тоже наверное интересно'
    ]));
  });

  window.clodik.onCursor(({ cursor, cursorArea }) => {
    lastCursor = cursor;

    if (cursorArea && (cursorArea.x !== areaX || cursorArea.y !== areaY)) {
      if (pendingMigrationArea && pendingMigrationArea.x === cursorArea.x && pendingMigrationArea.y === cursorArea.y) {
        pendingMigrationCount++;
      } else {
        pendingMigrationArea = cursorArea;
        pendingMigrationCount = 1;
      }
      if (pendingMigrationCount >= 2 && !isDragging && !falling) {
        migrateToArea(cursorArea, pick([
          'о, ты туда? бегу!', 'ага, погнали к тебе!', 'секунду, лечу!',
          'не бросай меня тут одного', 'жди, уже близко',
          'иду за тобой, не потеряю', 'переезжаю, секунду'
        ]));
        curiousCooldownUntil = Date.now() + 15000;
        pendingMigrationArea = null;
        pendingMigrationCount = 0;
      }
    } else {
      pendingMigrationArea = null;
      pendingMigrationCount = 0;
    }
  });

  window.clodik.onState(({ idleSeconds, workSeconds, justReturned, settings }) => {
    const now = Date.now();

    if (idleSeconds < 5 && workSeconds > 120 && emotion === 'idle' &&
        now > curiousCooldownUntil && !isDragging && !falling) {
      curiousCooldownUntil = now + randBetween(CURIOUS_COOLDOWN_MS);
      say(pick([
        'что делаешь?', 'над чем сидишь?', 'играем или работаем?', 'о, интересно, что там?',
        'опять залипаешь?', 'это рабочее или нет', 'покажи, что там у тебя',
        'можно глянуть?', 'ого, увлечённо как', 'и как успехи?',
        'выглядит важно', 'серьёзное дело, да?', 'не отвлекаю?',
        'ты сосредоточен, уважаю', 'что пишешь там', 'интересная задачка?',
        'кому пишешь?', 'это секрет или можно глянуть', 'работа или чат?',
        'о, активность пошла', 'продуктивный день сегодня?'
      ]), 2500);
      if (lastCursor) {
        wanderTarget = clamp(lastCursor.x - PET_W / 2, areaX, areaX + areaW - PET_W);
        walkingToCursor = true;
      }
    }

    if (settings.hunger < 25 && now > hungryCooldownUntil && !isDragging && !falling) {
      hungryCooldownUntil = now + randBetween([60000, 120000]);
      say(pick([
        'есть охота, если честно', 'покорми меня? 🥺', 'животик урчит',
        'пустой совсем', 'может, перекусим?', 'умираю с голоду, не преувеличиваю',
        'правый клик → покормить, намёк понят?'
      ]), 2800);
    }

    if (settings.happiness < 25 && now > sadCooldownUntil && !isDragging && !falling) {
      sadCooldownUntil = now + randBetween([90000, 150000]);
      sadIconUntil = now + 2800;
      lonelyUntil = now + 6000;
      say(pick([
        'мне грустновато последнее время', 'поиграй со мной, прошу',
        'настроение так себе', 'немного внимания бы не помешало',
        'я в порядке, просто скучаю по тебе'
      ]), 2800);
    }

    if (idleSeconds >= WORRIED_IDLE_SEC && idleSeconds < settings.sleepIdleSec &&
        now > worriedCooldownUntil && !isDragging && !falling) {
      worriedCooldownUntil = now + randBetween(WORRIED_COOLDOWN_MS);
      say(pick([
        'ты тут?', 'эй, заметь меня!', 'ау! я соскучился', 'ты где пропал?',
        'алло, живой там?', 'мышка, ну пошевелись', 'я волнуюсь вообще-то',
        'ты уснул или как', 'хватит игнорить', 'всё в порядке у тебя?',
        'надеюсь, ты просто отошёл', 'если что — я тут жду',
        'не пугай меня так', 'ладно, подожду ещё', 'эхо... эхо...',
        'хоть бы знак подал', 'стою тут как дурак и машу'
      ]), 2500);
    }

    if (emotionOverride || isDragging || falling || now < dizzyUntil) {
      emotion = emotionOverride || 'play';
      return;
    }

    if (idleSeconds >= settings.sleepIdleSec) {
      emotion = 'sleep';
    } else if (workSeconds >= settings.nagHardSec) {
      emotion = 'tired';
      maybeSayOnce('tired', pick([
        'я уже устал, правда...',
        'может всё-таки перерыв?',
        'ноги затекли сидеть на месте :(',
        'хватит уже, бля, работать',
        'ты не человек что ли',
        'я за тебя переживаю вообще-то',
        'спина у меня уже болит, а я даже не сижу',
        'серьёзно, отдохни немного',
        'твоё здоровье важнее дедлайна',
        'даже роботам нужен перерыв',
        'я не отстану, пока не отдохнёшь'
      ]));
    } else if (workSeconds >= settings.nagSec) {
      emotion = 'nag';
      maybeSayOnce('nag', pick([
        'ты давно без паузы!',
        'разомнись чутка?',
        'воды попей, а?',
        'моргни хоть разок',
        'шею разомни, а то как у краба будет',
        'перерыв — это не грех',
        'вставай, пройдись немного',
        'глаза отдохнуть должны',
        'пять минут погоды не сделают',
        'я как бы забочусь, между прочим'
      ]));
    } else {
      emotion = 'idle';
    }

    if (justReturned) {
      emotion = 'happy';
      registerInteraction();
      say(pick([
        'с возвращением!', 'ты где был?', 'ура, вернулся!',
        'наконец-то, я заждался', 'где шлялся', 'живой! отлично',
        'рад тебя видеть', 'хорошо отдохнул?', 'как всё прошло?'
      ]), 2500);
    }
  });

  let dragMouseStartX = 0, dragMouseStartY = 0;
  let dragWinStartX = 0, dragWinStartY = 0;
  let dragMoved = 0;
  let dragSamples = [];
  let shookThisDrag = false;
  let lastMoveSample = null;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    falling = false;
    dragMouseStartX = e.screenX;
    dragMouseStartY = e.screenY;
    dragWinStartX = winX;
    dragWinStartY = winY;
    dragMoved = 0;
    shookThisDrag = false;
    lastMoveSample = { t: Date.now(), x: e.screenX, y: e.screenY };
    dragSamples = [lastMoveSample];
    registerInteraction();
    say(pick([
      'опа, подняли!', 'держи крепче!', 'хи-хи, щекотно!',
      'эй, а спросить?', 'куда потащил', 'лечу!', 'ееее, полёт',
      'доверяю тебе', 'только аккуратно', 'ладно, неси'
    ]), 1500);
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.screenX - dragMouseStartX;
    const dy = e.screenY - dragMouseStartY;
    dragMoved = Math.max(dragMoved, Math.hypot(dx, dy));

    const newX = clamp(dragWinStartX + dx, areaX, areaX + areaW - PET_W);
    const newY = dragWinStartY + dy;
    dir = newX > winX ? 1 : (newX < winX ? -1 : dir);
    winX = newX;
    winY = newY;
    window.clodik.moveWindow(winX, winY);

    const now = Date.now();
    if (lastMoveSample) {
      const dt = Math.max(1, now - lastMoveSample.t);
      const vx = (e.screenX - lastMoveSample.x) / dt;
      const vy = (e.screenY - lastMoveSample.y) / dt;
      if (Math.abs(vx) > SHAKE_PXMS || Math.abs(vy) > SHAKE_PXMS) {
        angryUntil = now + 800;
        if (!shookThisDrag) {
          shookThisDrag = true;
          say(pick([
            'ай, не тряси!', 'укачаешь!', 'эй-эй, полегче!',
            'бля, хватит трясти', 'меня щас стошнит', 'аккуратнее, дурак',
            'пожалуйста, помедленнее', 'мне правда нехорошо так'
          ]), 1500);
        }
      }
    }
    lastMoveSample = { t: now, x: e.screenX, y: e.screenY };

    dragSamples.push({ t: now, x: e.screenX, y: e.screenY });
    if (dragSamples.length > 6) dragSamples.shift();
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    winY = Math.min(winY, maxRestY);
    window.clodik.moveWindow(winX, winY);

    let vx = 0, vy = 0;
    if (dragSamples.length >= 2) {
      const a = dragSamples[0];
      const b = dragSamples[dragSamples.length - 1];
      const dt = Math.max(1, b.t - a.t);
      vx = (b.x - a.x) / dt;
      vy = (b.y - a.y) / dt;
    }

    if (winY < restY - 0.5) {
      startFall(vx * 1000, vy * 1000);
    } else {
      restX = winX;
      restY = winY;
      if (!shookThisDrag) {
        petBurstUntil = Date.now() + 900;
        say(pick([
          'поставили!', 'ещё разок?', ':3', 'вот тут хорошо', 'о, новое место',
          'неплохой вид отсюда', 'мне тут нравится', 'удобненько'
        ]), 1200);
      }
    }
  });

  let lastClickAt = 0;
  canvas.addEventListener('click', () => {
    if (isDragging || dragMoved > 4) return;
    registerInteraction();
    window.clodik.statInc('pets');
    const now = Date.now();

    if (now - lastClickAt < 350) {
      lastClickAt = 0;
      if (!falling) startTrick();
      return;
    }
    lastClickAt = now;

    if (emotion === 'sleep') {
      say(pick([
        'мм... дай поспать', 'zzz... а? что?', 'попозже поиграем',
        'отвали, я сплю', 'пять минуточек ещё', 'ну поооожалуйста',
        'сон — это святое'
      ]), 1500);
      return;
    }
    if (emotion === 'tired' || emotion === 'nag') {
      petBurstUntil = now + 500;
      say(pick([
        'ну ладно, раз просишь', 'сил нет, но мур', 'ладно-ладно...',
        'еле живой, но для тебя — так и быть', 'из последних сил мурчу'
      ]), 1300);
      return;
    }

    clickTimes.push(now);
    clickTimes = clickTimes.filter(t => now - t < 4000);
    petBurstUntil = now + 1200;

    if (clickTimes.length >= 4) {
      loveMode = true;
      say(pick([
        'обожаю!', 'ещё, ещё!', '♥ ты лучший ♥', 'мур-мур-мур!',
        'я твой навеки', 'больше, больше!', 'это лучший день моей жизни',
        'спасибо, что любишь меня', 'мне с тобой хорошо', 'не отпускай'
      ]), 1400);
    } else {
      say(pick([
        'хи-хи!', 'мур~', ':3', 'ещё!', 'ня', 'хех, щекотно',
        'опять ты', 'ну привет', 'приятно', 'рад тебе', 'хорошо так'
      ]), 1200);
    }
  });
}

loadFrames(start);
