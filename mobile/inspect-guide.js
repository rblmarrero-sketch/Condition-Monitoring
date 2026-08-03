/* What to bring, how to take the reading, and what to look at while you are
   there — for every measurement point in an undercarriage round and every
   position in a GET round.

   Why this is a file and not a line of help text. A wear reading is only worth
   the method behind it. Two inspectors measuring a track roller, one across the
   tread and one over the flange, produce two numbers that trend against each
   other and mean nothing; the roller looks like it is growing. The reference
   tables in wear.js and get.js say what the limit is. Nothing in the system said
   how the number was supposed to be taken, so the method lived in whoever
   trained the inspector — and at 1,128 units and a rotating crew, that is not a
   place to keep it.

   `check` is deliberately separate from `how`. A millimetre is one finding; a
   cracked lip weld beside it is another, and it is usually the more expensive
   one. The round asks for the number, and this tells the inspector what else is
   in front of them while they are down there with a torch.

   Limits are NOT here. They belong to the model, they come from the supplier's
   own charts, and they are already in wear.js (per model) and get.js (generic
   until the supplier's figures arrive). This file is method, which is the same
   on every machine, and it must not become a second place where a limit lives
   and drifts.

   Codes are shared with those two files. GET has one collision — CRACK means
   "cracks or missing teeth" on a bucket and "cracks or deformation" on a blade
   — so an entry may be scoped "bucket.CRACK", and lookup falls back to the bare
   code. */
(function (G) {
  'use strict';

  /* code: [ tool_en, how_en, check_en,
             tool_ru, how_ru, check_ru ] */
  var E = {

    /* ---------------- undercarriage ---------------- */

    IDLER: [
      'Straightedge and depth rule',
      'Lay the straightedge across both tread flanges and measure down to the worn tread at the centre. This one GROWS as it wears — the number gets bigger, not smaller.',
      'Tread depth, flange wear, oil weeping at the seal, and any wobble when the track is jacked. An idler that has run dry usually shows a dry blue-grey tread before it seizes.',
      'Линейка-поверочная и глубиномер',
      'Положите поверочную линейку на обе реборды и замерьте вниз до изношенной поверхности по центру. Этот размер РАСТЁТ по мере износа — число увеличивается, а не уменьшается.',
      'Глубина обода, износ реборд, течь масла по уплотнению, люфт при вывешенной гусенице. Сухой сине-серый обод — признак работы без смазки перед заклиниванием.',
    ],
    CARRIER: [
      'Caliper',
      'Outside diameter across the tread, at the most worn part of the circumference. Turn the track and take the smallest reading you find.',
      'Diameter, flat spots, a roller that does not turn with the chain, and seal leaks. A seized carrier polishes one flat and saws into the link rail above it.',
      'Штангенциркуль',
      'Наружный диаметр по беговой дорожке в самом изношенном месте. Проверните гусеницу и возьмите наименьшее значение.',
      'Диаметр, лыски, каток, не вращающийся вместе с цепью, течи уплотнений. Заклинивший каток протирает лыску и пропиливает рельс звена над собой.',
    ],
    ROLLER: [
      'Caliper',
      'Outside diameter across the tread. Do every roller on the side, not a sample — they do not wear evenly, and the round is scored on the worst one.',
      'Diameter, flange wear, seized or leaking rollers. Front-to-rear taper across the set is an alignment or tension problem, not a roller problem — say so in the comment.',
      'Штангенциркуль',
      'Наружный диаметр по беговой дорожке. Замеряйте каждый каток на борту, а не выборочно — износ неравномерный, и оценка идёт по худшему.',
      'Диаметр, износ реборд, заклинившие и текущие катки. Разница износа от переднего к заднему — это развал или натяжение, а не сам каток; укажите в комментарии.',
    ],
    SPROCKET: [
      'Tape across the teeth, or the model\'s tooth-profile template',
      'Root to root across two opposite teeth, through the centre. Where the supplier gives a template, hold it on the tooth flank instead and read the gap.',
      'Hooked or pointed tooth tips, root wear, cracked or loose segment bolts. A hooked sprocket climbs the bushings and will throw a track.',
      'Рулетка по зубьям или шаблон профиля зуба',
      'От впадины до впадины через два противоположных зуба, через центр. Если поставщик даёт шаблон — приложите его к профилю зуба и оцените зазор.',
      'Крючкообразные и заострённые вершины зубьев, износ впадин, трещины и ослабленные болты сегментов. Крючок на звёздочке наезжает на втулки и сбрасывает гусеницу.',
    ],
    LINKH: [
      'Caliper',
      'Rail height of one link — from the rail running surface down to the bottom of the link — taken on a link sitting in the flat bottom run.',
      'Rail height, scalloping between links, cracked links, and links riding on their side. Scalloping means the rollers are past their limit even if the link is not.',
      'Штангенциркуль',
      'Высота звена — от беговой поверхности рельса до низа звена — на звене в прямом нижнем участке.',
      'Высота рельса, «фестоны» между звеньями, трещины звеньев, звенья с перекосом. Фестоны означают, что катки уже за пределом, даже если звено — нет.',
    ],
    BUSH: [
      'Caliper',
      'Outside diameter at the crown of the bushing, on a bushing at the top of the sprocket wrap where the wear is heaviest.',
      'Diameter, a bushing that has turned in the link, ridging, and a dry joint. Bushings are the item that decides whether the chain can be turned or has to be replaced.',
      'Штангенциркуль',
      'Наружный диаметр по вершине втулки — на втулке в верхней части охвата звёздочки, где износ максимален.',
      'Диаметр, провёрнутая втулка, кольцевые борозды, сухое соединение. Именно втулки решают, можно ли перевернуть цепь или её пора менять.',
    ],
    PITCH4: [
      'Tape measure',
      'Pin centre to pin centre over four links, on the tight top run. Same four links, same side, every round — pitch is a trend, and moving the start point invents stretch that is not there.',
      'Total stretch against new. Uneven stretch along the chain points at one dry joint rather than a worn-out chain.',
      'Рулетка',
      'От центра пальца до центра пальца через четыре звена, по натянутой верхней ветви. Каждый раз одни и те же четыре звена, тот же борт — шаг оценивается в динамике, и смена точки замера создаёт несуществующее удлинение.',
      'Суммарное удлинение относительно нового. Неравномерное удлинение по цепи указывает на одно сухое соединение, а не на износ всей цепи.',
    ],
    PITCH1: [
      'Tape measure',
      'Pin centre to pin centre on a single link. Quicker than the four-link measure and four times coarser — use it only where the track cannot be positioned for a four-link span.',
      'As for the four-link measure. Note in the comment that it was taken over one link, so the next inspector does not compare the two.',
      'Рулетка',
      'От центра пальца до центра пальца на одном звене. Быстрее, чем по четырём звеньям, и вчетверо грубее — применяйте только там, где нельзя выставить гусеницу под замер по четырём звеньям.',
      'То же, что и при замере по четырём звеньям. Отметьте в комментарии, что замер по одному звену, чтобы следующий инспектор не сравнивал разные методы.',
    ],
    GROUSER: [
      'Rule',
      'Rule flat on the link rail, measure up to the grouser tip. Clear the packed mud and ice off first — frozen spoil under the rule is the most common bad reading of the winter.',
      'Height, bent or torn grousers, and the wear pattern. Rounded grousers on one side only is a steering habit worth naming.',
      'Линейка',
      'Линейку плашмя на рельс звена, замер до вершины грунтозацепа. Сначала очистите налипшую грязь и лёд — примёрзшая порода под линейкой даёт самое частое зимнее искажение.',
      'Высота, погнутые и вырванные грунтозацепы, характер износа. Скругление грунтозацепов только с одной стороны — это манера управления, о ней стоит написать.',
    ],

    /* ---------------- GET — bucket ---------------- */

    TOOTH: [
      'Tape measure, or the supplier\'s tooth wear gauge',
      'Along the centreline from the tip back to the front face of the adapter nose. Measure two or three across the set and record the worst.',
      'Tip length, bent or rotated points, broken tips, and any point that moves by hand. Unequal wear across the set is a loading habit — the operator is digging on one corner.',
      'Рулетка или шаблон износа зуба от поставщика',
      'По осевой линии от острия до передней плоскости носка адаптера. Замерьте два-три зуба по ряду и запишите худший.',
      'Длина зуба, погнутые и провёрнутые зубья, обломанные острия, любой зуб, шевелящийся от руки. Неравномерный износ по ряду — манера черпания: оператор копает одним углом.',
    ],
    ADAPTER: [
      'Caliper or tape',
      'Nose height at the tooth seat, or the remaining leg length where it laps over the lip.',
      'Nose wear, cracks at the strap weld, wallowed pin holes, and adapters that have gone loose on the lip. A loose adapter takes the lip with it.',
      'Штангенциркуль или рулетка',
      'Высота носка в посадке зуба либо остаточная длина лапы в месте нахлёста на кромку.',
      'Износ носка, трещины по сварке лапы, разбитые отверстия под палец, ослабленные на кромке адаптеры. Ослабленный адаптер уводит за собой кромку.',
    ],
    PIN: [
      'Hammer and drift, torch',
      'Tap each pin. A sound retainer rings and does not move; a loose one thuds and walks. No measurement — this is pass or fail.',
      'Missing pins, pins backed part way out, mushroomed heads, and perished rubber locks. Count them against the number of teeth fitted.',
      'Молоток и выколотка, фонарь',
      'Простучите каждый палец. Исправный фиксатор звенит и не двигается; ослабленный отзывается глухо и уходит. Замера нет — это годен/не годен.',
      'Отсутствующие пальцы, пальцы, вышедшие наполовину, расклёпанные головки, разрушенные резиновые фиксаторы. Сверьте количество с числом установленных зубьев.',
    ],
    LIP: [
      'Tape or rule',
      'Lip thickness at three places — both corners and the centre — with the rule against the vertical face. Record the thinnest.',
      'Thinning behind the adapters, "smiles" opening up between them, and cracks at the lip-to-shell weld. A lip is a weld repair while it is thick and a new lip once it is not.',
      'Рулетка или линейка',
      'Толщина кромки в трёх местах — оба угла и центр — линейкой по вертикальной плоскости. Записывайте наименьшее.',
      'Утонение за адаптерами, раскрывающиеся «улыбки» между ними, трещины по сварке кромки с корпусом. Пока кромка толстая — это наплавка, когда утонела — новая кромка.',
    ],
    CUTL: [
      'Rule or tape',
      'Remaining width from the bucket sidewall out to the cutter edge, at the widest point of the cutter.',
      'Worn back to the bolt heads, sheared or missing bolts, and wear cutting into the sidewall behind the cutter. Once the sidewall is being cut the repair stops being a bolt-on part.',
      'Линейка или рулетка',
      'Остаточная ширина от боковой стенки ковша до кромки ножа в самом широком месте.',
      'Износ до головок болтов, срезанные и отсутствующие болты, подрез боковой стенки за ножом. Как только режет стенку — это уже не замена болтового элемента.',
    ],
    CUTR: [
      'Rule or tape',
      'Remaining width from the bucket sidewall out to the cutter edge, at the widest point of the cutter.',
      'Worn back to the bolt heads, sheared or missing bolts, and wear cutting into the sidewall behind the cutter. Compare with the left one — a big difference is a loading habit, not a part fault.',
      'Линейка или рулетка',
      'Остаточная ширина от боковой стенки ковша до кромки ножа в самом широком месте.',
      'Износ до головок болтов, срезанные и отсутствующие болты, подрез боковой стенки за ножом. Сравните с левым: большая разница — это манера черпания, а не дефект детали.',
    ],
    SHROUD: [
      'Rule or depth gauge',
      'Remaining thickness over the corner casting, at the most worn face.',
      'Worn through to the parent metal, cracked welds, and shrouds gone missing altogether. A shroud is there so the corner is not the wear part — once it is through, the corner is.',
      'Линейка или глубиномер',
      'Остаточная толщина по угловой защите на самой изношенной плоскости.',
      'Протёртость до основного металла, трещины по сварке, полностью утраченные защиты. Защита ставится, чтобы изнашивалась не сама кромка угла — если она прогорела, изнашивается угол.',
    ],
    FLOOR: [
      'Ultrasonic thickness gauge, or a depth gauge at a burn hole',
      'Three points along the floor centreline, front to back. Clean the scale off first — UT through packed dirt reads thick.',
      'Plate thickness, cracked plate welds, deep gouging, and any place the shell is showing through. The floor is what stops a bucket becoming a repair.',
      'Ультразвуковой толщиномер или глубиномер через контрольное отверстие',
      'Три точки по осевой линии днища, спереди назад. Сначала зачистите окалину — УЗ через налипшую породу завышает толщину.',
      'Толщина листа, трещины по сварке футеровки, глубокие задиры, любые места с проглядывающим корпусом. Днище — это то, что не даёт ковшу уйти в ремонт.',
    ],
    WALLL: [
      'UT gauge or rule',
      'Thickness at mid-height, front and rear. The front third takes most of the abrasion — take that one as the reading.',
      'Thinning at the front third, cracking, and plates lifting at the edge. A lifted plate fills behind and tears the next one off.',
      'Толщиномер или линейка',
      'Толщина на середине высоты, спереди и сзади. Наибольший абразивный износ — в передней трети, её и берите за результат.',
      'Утонение в передней трети, трещины, отрыв листов по кромке. Под отогнутый лист набивается порода и срывает следующий.',
    ],
    WALLR: [
      'UT gauge or rule',
      'Thickness at mid-height, front and rear. The front third takes most of the abrasion — take that one as the reading.',
      'Thinning at the front third, cracking, and plates lifting at the edge. Compare with the left wall before calling it normal wear.',
      'Толщиномер или линейка',
      'Толщина на середине высоты, спереди и сзади. Наибольший абразивный износ — в передней трети, её и берите за результат.',
      'Утонение в передней трети, трещины, отрыв листов по кромке. Сравните с левой стенкой, прежде чем считать износ нормальным.',
    ],
    'bucket.CRACK': [
      'Torch, wire brush, and crack-detection spray where you need it',
      'Bucket clean, on the ground, cold. Follow the weld lines: lip to shell, sidewall gussets, the ear and pin bosses. No measurement — record what you find in the comment.',
      'Any crack, with its length and where it runs. Count anything missing off the machine — a tooth, an adapter, a shroud. A missing tooth is now in the load and heading for the crusher; that goes out before the next bucket, not at the end of the round.',
      'Фонарь, металлическая щётка, при необходимости — проявитель для контроля трещин',
      'Ковш очищен, опущен на грунт, остывший. Идите по линиям сварки: кромка — корпус, косынки боковых стенок, проушины и бобышки пальцев. Замера нет — опишите найденное в комментарии.',
      'Любая трещина, её длина и направление. Пересчитайте всё утраченное — зуб, адаптер, защиту. Утраченный зуб уже в горной массе и идёт к дробилке; сообщать об этом нужно до следующего черпания, а не в конце обхода.',
    ],

    /* ---------------- GET — blade and ripper ---------------- */

    ENDL: [
      'Rule or tape',
      'Remaining height from the mouldboard bottom down to the wear edge, at the outer end of the bit.',
      'Worn back to the bolt line, broken corners, missing bolts. End bits protect the mouldboard corner and are cheap next to it.',
      'Линейка или рулетка',
      'Остаточная высота от низа отвала до режущей кромки на внешнем конце ножа.',
      'Износ до линии болтов, обломанные углы, отсутствующие болты. Боковые ножи защищают угол отвала и стоят несопоставимо дешевле.',
    ],
    EDGEL: [
      'Rule or tape',
      'Remaining height at the centre of the segment, from the mouldboard face down to the cutting lip.',
      'Uneven wear between segments — worth swapping end for end before replacing. Worn to the bolt heads, and cracked segments.',
      'Линейка или рулетка',
      'Остаточная высота по центру сегмента, от плоскости отвала до режущей кромки.',
      'Неравномерный износ между сегментами — стоит переставить местами до замены. Износ до головок болтов, трещины сегментов.',
    ],
    EDGEC: [
      'Rule or tape',
      'Remaining height at the centre of the segment, from the mouldboard face down to the cutting lip.',
      'The centre segment normally leads the wear. Where it does not, the blade is not sitting flat — say so, it is a cylinder or a pin, not an edge.',
      'Линейка или рулетка',
      'Остаточная высота по центру сегмента, от плоскости отвала до режущей кромки.',
      'Обычно центральный сегмент изнашивается быстрее. Если нет — отвал стоит не плоско; отметьте это: причина в гидроцилиндре или пальце, а не в кромке.',
    ],
    EDGER: [
      'Rule or tape',
      'Remaining height at the centre of the segment, from the mouldboard face down to the cutting lip.',
      'Uneven wear between segments, worn to the bolt heads, cracked segments. Compare against the left segment before calling it normal.',
      'Линейка или рулетка',
      'Остаточная высота по центру сегмента, от плоскости отвала до режущей кромки.',
      'Неравномерный износ между сегментами, износ до головок болтов, трещины. Сравните с левым сегментом, прежде чем считать износ нормальным.',
    ],
    ENDR: [
      'Rule or tape',
      'Remaining height from the mouldboard bottom down to the wear edge, at the outer end of the bit.',
      'Worn back to the bolt line, broken corners, missing bolts. A big left-to-right difference is how the machine is being driven.',
      'Линейка или рулетка',
      'Остаточная высота от низа отвала до режущей кромки на внешнем конце ножа.',
      'Износ до линии болтов, обломанные углы, отсутствующие болты. Большая разница между бортами — это стиль работы машины.',
    ],
    CORNER: [
      'UT gauge or rule',
      'Remaining thickness at the corner wrap, where the mouldboard turns.',
      'Holed skin, cracks along the corner weld, and the corner folding back. Once the skin is holed the spoil packs inside the mouldboard.',
      'Толщиномер или линейка',
      'Остаточная толщина по обечайке угла в месте перегиба отвала.',
      'Прогары обшивки, трещины по сварке угла, загиб угла назад. После прогара порода набивается внутрь отвала.',
    ],
    STRIP: [
      'UT gauge or depth gauge',
      'Thickness at the most worn point of the strip.',
      'Strips worn through into the mouldboard behind them. Wear strips are sacrificial — replacing them late costs the mouldboard, not the strip.',
      'Толщиномер или глубиномер',
      'Толщина в самой изношенной точке накладки.',
      'Накладки, протёртые до отвала за ними. Износные накладки — расходная деталь; поздняя замена стоит отвала, а не накладки.',
    ],
    RTIP: [
      'Tape measure',
      'Tip length from the point back to the shank nose, along the centreline.',
      'Blunt or rounded tip, a tip loose on the shank, and the retaining pin. A blunt ripper point loads the shank and the machine instead of the ground.',
      'Рулетка',
      'Длина наконечника от острия до носка стойки по осевой линии.',
      'Затупленное или скруглённое острие, наконечник с люфтом на стойке, состояние фиксатора. Тупой наконечник нагружает стойку и машину вместо породы.',
    ],
    RSHANK: [
      'Caliper or tape',
      'Shank nose thickness at the tip seat.',
      'Nose wear, cracks at the shank pocket, wallowed pin holes, and a shank that is bent back. A worn nose will not hold a new tip.',
      'Штангенциркуль или рулетка',
      'Толщина носка стойки в посадке наконечника.',
      'Износ носка, трещины в кармане стойки, разбитые отверстия под палец, загнутая назад стойка. Изношенный носок не удержит новый наконечник.',
    ],
    BOLT: [
      'Torque wrench and hammer',
      'Sound each edge bolt with the hammer, then torque-check to the manual figure. New edges must be re-torqued after the first shift — that is when they settle and back off.',
      'Missing or sheared bolts, elongated holes, loose nuts, and plough bolt heads worn flush. No measurement — pass or fail.',
      'Динамометрический ключ и молоток',
      'Простучите каждый болт кромки молотком, затем проверьте момент по руководству. Новые кромки обязательно протягивать после первой смены — именно тогда они садятся и ослабевают.',
      'Отсутствующие и срезанные болты, разбитые отверстия, ослабленные гайки, потайные головки, изношенные заподлицо. Замера нет — годен/не годен.',
    ],
    'blade.CRACK': [
      'Torch and wire brush',
      'Blade down and clean. Look along the mouldboard weld lines, the push-arm mounts and the tilt-cylinder ears. No measurement — describe it in the comment.',
      'Cracks with length and location, a bent mouldboard, twisted push arms, and slop in the trunnions. A cracked push-arm mount is a stop, not a watch item.',
      'Фонарь и металлическая щётка',
      'Отвал опущен и очищен. Осмотрите линии сварки отвала, крепления толкающих брусьев и проушины гидроцилиндров перекоса. Замера нет — опишите в комментарии.',
      'Трещины с длиной и расположением, погнутый отвал, скрученные толкающие брусья, люфт в шаровых опорах. Трещина в креплении толкающего бруса — это остановка, а не наблюдение.',
    ],
  };

  /* Scoped key first — "bucket.CRACK" is not the same job as "blade.CRACK" —
     then the bare code. */
  function look(code, scope) {
    if (!code) return null;
    return (scope && E[scope + '.' + code]) || E[code] || null;
  }

  G.GUIDE = {
    /* {tool, how, check} in the asked-for language, or null where there is no
       entry. Null is a real answer: a point nobody has written a method for
       shows the reference alone, rather than a heading with nothing under it. */
    for: function (code, scope, lang) {
      var r = look(code, scope);
      if (!r) return null;
      var i = (lang === 'ru') ? 3 : 0;
      return { tool: r[i], how: r[i + 1], check: r[i + 2] };
    },
    has: function (code, scope) { return !!look(code, scope); },
    codes: function () { return Object.keys(E); },
  };
})(typeof self !== 'undefined' ? self : this);
