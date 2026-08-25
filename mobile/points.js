/* What each point on a round is CALLED.

   Every other round type has had this as a file of its own for a long time —
   uc-points.js names an undercarriage station, get.js a ground engaging tool,
   body-points.js a dump body panel, lube.js a compartment — and each of them
   holds both languages, so the phone, the report and the dashboard cannot
   disagree about what a position is.

   The magnetic plug, the filter cut and the walk-around inspection did not.
   Their vocabulary lived inside mobile/index.html, which the dashboard does
   not load, so the office had no reference to name a plug position from and
   fell back to the label the phone happened to write at capture time — a
   single string, in whichever language that phone was set to.

   That is not a cosmetic problem. It produced a unit report where the same
   four plugs on the same truck read "4C LEFT REAR FINAL DRIVE" on the round
   captured in English and "Левый задний бортовой редуктор" on the round
   captured in Russian, one above the other, in a document whose whole purpose
   is comparing them. Both records were correct. Neither could be rendered in
   the reader's own language, because the name had been frozen at capture
   instead of looked up.

   So it moves here, with the others, and both ends read from it.

   Written to `self` rather than `window`: the service worker imports this file
   to decide what to cache, and a service worker has no window. */
(function (G) {
  'use strict';

  var COMP = {
    ENG:{en:"Engine",ru:"Двигатель"}, COOL:{en:"Cooling System",ru:"Система охлаждения"},
    AIR:{en:"Air Intake & Exhaust",ru:"Впуск и выпуск"}, FUEL:{en:"Fuel System",ru:"Топливная система"},
    TRANS:{en:"Transmission",ru:"Трансмиссия"}, TCONV:{en:"Torque Converter",ru:"Гидротрансформатор"},
    DRV:{en:"Driveline",ru:"Карданная передача"}, DIFF:{en:"Differential",ru:"Дифференциал"},
    FDR:{en:"Final Drives",ru:"Бортовые редукторы"}, HYD:{en:"Hydraulic System",ru:"Гидросистема"},
    HOIST:{en:"Hoist & Body",ru:"Подъём и кузов"}, STEER:{en:"Steering",ru:"Рулевое управление"},
    BRK:{en:"Brakes & Retarder",ru:"Тормоза и ретардер"}, SUSP:{en:"Suspension",ru:"Подвеска"},
    FRAME:{en:"Frame & Chassis",ru:"Рама и шасси"}, TYRE:{en:"Tyres & Rims",ru:"Шины и диски"},
    ELEC:{en:"Electrical",ru:"Электрооборудование"}, CAB:{en:"Cab & Controls",ru:"Кабина и управление"},
    LUBE:{en:"Auto-Lube",ru:"Система смазки"}, FIRE:{en:"Fire & Safety",ru:"Пожаробезопасность"},
    ETRAC:{en:"Electric Drive / Traction",ru:"Электропривод / тяга"}, WHEELM:{en:"Wheel Motors",ru:"Мотор-колёса"},
    SWING:{en:"Swing System",ru:"Механизм поворота"}, SWGB:{en:"Swing Gearbox",ru:"Редуктор поворота"},
    TRAVEL:{en:"Travel / Track Drive",ru:"Ходовой привод"}, UC:{en:"Undercarriage",ru:"Ходовая часть"},
    TRACK:{en:"Tracks & Tension",ru:"Гусеницы и натяжение"}, BOOM:{en:"Boom",ru:"Стрела"},
    STICK:{en:"Stick / Arm",ru:"Рукоять"}, BKT:{en:"Bucket & GET",ru:"Ковш и зубья"},
    ATT:{en:"Attachment / Pins",ru:"Навесное / пальцы"}, BLADE:{en:"Blade & C-Frame",ru:"Отвал и С-рама"},
    RIPPER:{en:"Ripper",ru:"Рыхлитель"}, MOLD:{en:"Moldboard & Circle",ru:"Отвал и круг"},
    DRAWBAR:{en:"Drawbar",ru:"Тяговая рама"}, TANDEM:{en:"Tandems",ru:"Балансиры"},
    ARTIC:{en:"Articulation Joint",ru:"Шарнир сочленения"}, AXLE:{en:"Axles",ru:"Мосты"},
    LINK:{en:"Bucket Linkage",ru:"Рычаги ковша"},
    COMPR:{en:"Compressor",ru:"Компрессор"}, ROT:{en:"Rotary Head",ru:"Вращатель"},
    FEED:{en:"Feed System",ru:"Система подачи"}, MAST:{en:"Mast",ru:"Мачта"},
    DSTR:{en:"Drill String",ru:"Буровой став"}, DUST:{en:"Dust Collector",ru:"Пылеуловитель"},
    WINCH:{en:"Winch",ru:"Лебёдка"}, ROD:{en:"Drill Rods",ru:"Буровые штанги"},
    JAW:{en:"Jaw Plates",ru:"Дробящие плиты"}, TOGGLE:{en:"Toggle",ru:"Распорная плита"},
    ECC:{en:"Eccentric Shaft",ru:"Эксцентриковый вал"}, BEAR:{en:"Bearings",ru:"Подшипники"},
    FEEDER:{en:"Feeder",ru:"Питатель"}, CONV:{en:"Conveyor",ru:"Конвейер"}, DRIVE:{en:"Drive",ru:"Привод"},
    MANTLE:{en:"Mantle & Concave",ru:"Мантия и чаша"}, MSHAFT:{en:"Main Shaft",ru:"Главный вал"},
    LUBEU:{en:"Lubrication Unit",ru:"Маслостанция"}, TRAMP:{en:"Tramp Release",ru:"Система разгрузки"},
    SCRM:{en:"Screen Media",ru:"Просеивающие поверхности"}, EXCITER:{en:"Exciter / Vibrator",ru:"Вибровозбудитель"},
    SPRING:{en:"Springs / Mounts",ru:"Пружины / опоры"}, DECK:{en:"Deck / Structure",ru:"Дека / конструкция"},
    BODY:{en:"Breaker Body",ru:"Корпус гидромолота"}, PISTON:{en:"Piston",ru:"Поршень"},
    BUSH:{en:"Bushings",ru:"Втулки"}, CHISEL:{en:"Chisel / Tool",ru:"Пика / инструмент"},
    ACCUM:{en:"Accumulator",ru:"Гидроаккумулятор"}, HOSE:{en:"Hoses",ru:"Рукава РВД"},
    BRACKET:{en:"Mounting Bracket",ru:"Монтажный кронштейн"},
  };
  function mk(k,en,ru){ return {k,en,ru}; }
  // asset = the matrix Asset Range EN used to filter Direct Causes ("" = no filter).
  var CLASSES = {
    HT:{ en:"Haul Truck", ru:"Карьерный самосвал", asset:"TRUCK, DUMP",
      MP:[mk("4C","Left Rear Final Drive","Левый задний бортовой редуктор"),mk("4D","Right Rear Final Drive","Правый задний бортовой редуктор"),
          mk("4E","Left Rear Final Drive","Левый задний бортовой редуктор"),mk("4F","Right Rear Final Drive","Правый задний бортовой редуктор")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("HYD","Hydraulic Filter","Гидравлический фильтр"),
          mk("FDR","Final Drive Filter","Фильтр бортового редуктора"),mk("FUEL","Fuel Filter","Топливный фильтр")],
      INSP:["ENG","COOL","AIR","FUEL","ETRAC","WHEELM","FDR","HYD","HOIST","STEER","BRK","SUSP","FRAME","TYRE","ELEC","CAB","LUBE","FIRE"] },
    AT:{ en:"Articulated Truck", ru:"Сочленённый самосвал", asset:"TRUCK, ARTICULATED",
      MP:[mk("FRD","Front Differential","Передний дифференциал"),mk("CTR","Centre / Inter-axle","Межосевой дифференциал"),
          mk("RRD","Rear Differential","Задний дифференциал"),mk("TRANS","Transmission","Трансмиссия")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("TRANS","Transmission Filter","Фильтр трансмиссии"),
          mk("HYD","Hydraulic Filter","Гидравлический фильтр"),mk("FUEL","Fuel Filter","Топливный фильтр")],
      INSP:["ENG","COOL","AIR","FUEL","TRANS","ARTIC","AXLE","DRV","DIFF","HYD","HOIST","STEER","BRK","TYRE","FRAME","ELEC","CAB","LUBE","FIRE"] },
    EXC:{ en:"Excavator", ru:"Экскаватор", asset:"EXCAVATOR, BUCKET",
      MP:[mk("TL","Left Travel Final Drive","Левый ходовой редуктор"),mk("TR","Right Travel Final Drive","Правый ходовой редуктор"),
          mk("SW1","Swing Gearbox 1","Редуктор поворота 1"),mk("SW2","Swing Gearbox 2","Редуктор поворота 2"),mk("PD","Pump Drive / PTO","Привод насосов")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("HYD","Main Hydraulic Filter","Основной гидрофильтр"),mk("PILOT","Pilot Filter","Фильтр управления"),
          mk("FUEL","Fuel Filter","Топливный фильтр"),mk("SWING","Swing Drive Filter","Фильтр редуктора поворота"),mk("TRAVEL","Travel Drive Filter","Фильтр ходового привода")],
      INSP:["ENG","COOL","AIR","FUEL","HYD","SWING","SWGB","TRAVEL","UC","TRACK","BOOM","STICK","BKT","ATT","ELEC","CAB","FRAME","LUBE","FIRE"] },
    DOZ:{ en:"Dozer", ru:"Бульдозер", asset:"DOZER, TRACK TYPE",
      MP:[mk("FDL","Left Final Drive","Левый бортовой редуктор"),mk("FDRR","Right Final Drive","Правый бортовой редуктор"),
          mk("TRANS","Transmission","Трансмиссия"),mk("BEVEL","Bevel / Steer Gear","Конический/поворотный редуктор")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("TRANS","Transmission Filter","Фильтр трансмиссии"),
          mk("HYD","Hydraulic Filter","Гидравлический фильтр"),mk("FUEL","Fuel Filter","Топливный фильтр")],
      INSP:["ENG","COOL","AIR","FUEL","TRANS","TCONV","STEER","FDR","UC","TRACK","BLADE","RIPPER","HYD","BRK","FRAME","ELEC","CAB","LUBE","FIRE"] },
    LDR:{ en:"Wheel Loader", ru:"Фронтальный погрузчик", asset:"LOADER, FRONT",
      MP:[mk("FDIF","Front Differential","Передний дифференциал"),mk("RDIF","Rear Differential","Задний дифференциал"),mk("TRANS","Transmission","Трансмиссия"),
          mk("LF","LF Wheel End","Левый передний редуктор"),mk("RF","RF Wheel End","Правый передний редуктор"),mk("LR","LR Wheel End","Левый задний редуктор"),mk("RR","RR Wheel End","Правый задний редуктор")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("TRANS","Transmission Filter","Фильтр трансмиссии"),mk("HYD","Hydraulic Filter","Гидравлический фильтр"),
          mk("AXLE","Axle Filter","Фильтр моста"),mk("FUEL","Fuel Filter","Топливный фильтр")],
      INSP:["ENG","COOL","AIR","FUEL","TRANS","TCONV","DRV","AXLE","DIFF","FDR","HYD","LINK","BKT","ARTIC","STEER","BRK","TYRE","FRAME","ELEC","CAB","LUBE","FIRE"] },
    GRD:{ en:"Grader", ru:"Автогрейдер", asset:"GRADER, MOBILE",
      MP:[mk("TANL","Left Tandem","Левый балансир"),mk("TANR","Right Tandem","Правый балансир"),mk("TRANS","Transmission","Трансмиссия"),
          mk("DIFF","Differential","Дифференциал"),mk("CIRCLE","Circle Drive","Привод круга")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("TRANS","Transmission Filter","Фильтр трансмиссии"),mk("HYD","Hydraulic Filter","Гидравлический фильтр"),
          mk("TANDEM","Tandem Filter","Фильтр балансира"),mk("FUEL","Fuel Filter","Топливный фильтр")],
      INSP:["ENG","COOL","AIR","FUEL","TRANS","TANDEM","MOLD","DRAWBAR","RIPPER","HYD","STEER","ARTIC","AXLE","BRK","TYRE","FRAME","ELEC","CAB","LUBE","FIRE"] },
    DRB:{ en:"Blasthole Drill", ru:"Буровой станок", asset:"DRILL, BLASTING",
      MP:[mk("ROT","Rotary Head Gearbox","Редуктор вращателя"),mk("COMPR","Compressor Sump","Картер компрессора"),
          mk("FEED","Feed Gearbox","Редуктор подачи"),mk("TRK","Track Final Drive","Ходовой редуктор")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("HYD","Hydraulic Filter","Гидравлический фильтр"),
          mk("COMPR","Compressor Oil Filter","Фильтр масла компрессора"),mk("FUEL","Fuel Filter","Топливный фильтр")],
      INSP:["ENG","COOL","AIR","FUEL","COMPR","ROT","FEED","MAST","DSTR","DUST","HYD","UC","TRACK","ELEC","CAB","LUBE","FIRE"] },
    DRE:{ en:"Exploration Drill", ru:"Разведочный буровой станок", asset:"DRILL, EXPLORATION",
      MP:[mk("ROT","Rotation Gearbox","Редуктор вращения"),mk("WIN","Winch Gearbox","Редуктор лебёдки"),mk("HYD","Hydraulic Tank","Гидробак")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("HYD","Hydraulic Filter","Гидравлический фильтр"),mk("FUEL","Fuel Filter","Топливный фильтр")],
      INSP:["ENG","COOL","FUEL","HYD","ROT","FEED","MAST","ROD","COMPR","WINCH","UC","ELEC","CAB","LUBE","FIRE"] },
    CRJ:{ en:"Jaw Crusher", ru:"Щековая дробилка", asset:"CRUSHER, MOBILE JAW",
      MP:[mk("ECC","Eccentric / Oil Sump","Эксцентрик / картер"),mk("DRV","Drive Gearbox","Редуктор привода"),mk("LUBE","Lube Tank","Бак смазки")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("HYD","Hydraulic Filter","Гидравлический фильтр"),
          mk("LUBE","Lube Oil Filter","Фильтр смазки"),mk("FUEL","Fuel Filter","Топливный фильтр")],
      INSP:["JAW","TOGGLE","ECC","BEAR","FEEDER","CONV","HYD","DRIVE","ENG","ELEC","FRAME","LUBE","FIRE"] },
    CRC:{ en:"Cone Crusher", ru:"Конусная дробилка", asset:"CRUSHER, MOBILE CONE",
      MP:[mk("MSH","Main Shaft / Oil","Главный вал / масло"),mk("LUBE","Lube Tank","Бак смазки"),mk("DRV","Drive Gearbox","Редуктор привода")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("HYD","Hydraulic Filter","Гидравлический фильтр"),
          mk("LUBE","Lube Oil Filter","Фильтр смазки"),mk("FUEL","Fuel Filter","Топливный фильтр")],
      INSP:["MANTLE","MSHAFT","ECC","BEAR","LUBEU","TRAMP","HYD","DRIVE","FEEDER","CONV","ENG","ELEC","FRAME","FIRE"] },
    SCR:{ en:"Screen", ru:"Грохот", asset:"SCREENER, MOBILE",
      MP:[mk("EXC","Exciter Oil","Масло вибровозбудителя"),mk("BRG","Bearing Housing","Корпус подшипника")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("HYD","Hydraulic Filter","Гидравлический фильтр"),mk("FUEL","Fuel Filter","Топливный фильтр")],
      INSP:["SCRM","EXCITER","BEAR","SPRING","DECK","FEEDER","CONV","DRIVE","HYD","ENG","ELEC","FRAME","FIRE"] },
    HRB:{ en:"Rock Breaker", ru:"Гидромолот", asset:"HYDRAULIC ROCK BREAKER",
      MP:[mk("HYD","Hydraulic Oil Sample","Проба гидравлического масла")],
      FC:[mk("HYD","Hydraulic Filter","Гидравлический фильтр")],
      INSP:["BODY","PISTON","BUSH","CHISEL","ACCUM","HOSE","BRACKET","HYD"] },
    GEN:{ en:"General / Other", ru:"Общее / Другое", asset:"",
      MP:[mk("TRANS","Transmission","Трансмиссия"),mk("DIFF","Differential","Дифференциал"),mk("FD1","Final Drive 1","Бортовой редуктор 1"),
          mk("FD2","Final Drive 2","Бортовой редуктор 2"),mk("HYD","Hydraulic Tank","Гидробак")],
      FC:[mk("ENG","Engine Oil Filter","Фильтр моторного масла"),mk("TRANS","Transmission Filter","Фильтр трансмиссии"),
          mk("HYD","Hydraulic Filter","Гидравлический фильтр"),mk("FUEL","Fuel Filter","Топливный фильтр")],
      INSP:["ENG","COOL","AIR","FUEL","TRANS","DRV","HYD","UC","TYRE","BRK","STEER","FRAME","ELEC","CAB","LUBE","FIRE"] },
  };
  CLASSES.ALL = { en:"All equipment", ru:"Всё оборудование", asset:"", MP:CLASSES.GEN.MP, FC:CLASSES.GEN.FC, INSP:CLASSES.GEN.INSP };
  /* A class by whichever name the caller happens to hold.

     A record carries `cls` as the class CODE — "HT" — but the register and the
     report masthead carry the asset range it came from — "TRUCK, DUMP" — and
     more than one caller has one and not the other. Resolving only the code
     meant a record identified by its asset range fell through to the generic
     list, found nothing, and dropped back to the frozen capture-time label:
     the exact failure this file exists to end, reappearing one layer down. */
  var BY_ASSET = {};
  Object.keys(CLASSES).forEach(function (k) {
    var a = CLASSES[k] && CLASSES[k].asset;
    if (a && !BY_ASSET[String(a).toUpperCase()]) BY_ASSET[String(a).toUpperCase()] = k;
  });
  function classOf(cls) {
    var k = String(cls == null ? "" : cls);
    if (CLASSES[k]) return k;
    return BY_ASSET[k.toUpperCase()] || "";
  }

  /* The name of one point, in one language, or "" when this reference has
     never heard of it. "" and not the key: a caller that gets a key back
     cannot tell a real name from a fallback, and every one of them already
     knows how to print the key itself. */
  function label(cls, type, key, lang) {
    var c = CLASSES[classOf(cls)] || CLASSES.ALL, list = (c && c[type]) || [];
    var lg = lang === "ru" ? "ru" : "en";
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (typeof e === "string") {
        if (e === key) return COMP[e] ? (COMP[e][lg] || COMP[e].en || "") : "";
      } else if (e.k === key) return e[lg] || e.en || "";
    }
    /* A round type this class does not list, on a point every class shares —
       a thermal survey names its points from the inspection list, and a
       machine whose class was never filled in still has an engine. */
    if (COMP[key]) return COMP[key][lg] || COMP[key].en || "";
    return "";
  }

  /* The equipment class itself: "Haul Truck" / "Карьерный самосвал". */
  function classLabel(cls, lang) {
    var c = CLASSES[classOf(cls)];
    return c ? (c[lang === "ru" ? "ru" : "en"] || c.en || "") : "";
  }

  G.PTS = { COMP: COMP, CLASSES: CLASSES, mk: mk, label: label,
            classLabel: classLabel, classOf: classOf };
})(typeof self !== 'undefined' ? self : this);
