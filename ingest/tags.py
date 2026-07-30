# Applicability tags per defect code. Tag = "what kind of thing can fail this way".
TAGS={
"DT1-01":"FLUID HYD ENGINE MECH","DT1-02":"UNIV","DT1-03":"FLUID HYD PNEU ENGINE",
"DT1-04":"MECH DRIVE ENGINE CRUSH SCREEN CONV","DT1-05":"MECH DRIVE CONV","DT1-06":"MECH",
"DT1-07":"MECH DRIVE","DT1-08":"MECH","DT1-09":"MECH HYD DRIVE","DT1-10":"MECH HYD FLUID",
"DT1-11":"FLUID HYD PNEU ENGINE","DT1-12":"FLUID HYD ENGINE","DT1-13":"FLUID HYD ENGINE OIL",
"DT1-14":"HYD FLUID","DT1-15":"ENGINE ELEC","DT1-16":"ENGINE ELEC MECH","DT1-17":"ENGINE DRIVE ELEC",
"DT1-18":"ENGINE ELEC","DT1-19":"DRIVE HYD MECH","DT1-20":"HYD CI DRIVE","DT1-21":"CI ELEC HYD ENGINE",
"DT1-22":"DRIVE ENGINE CONV CRUSH","DT1-23":"MECH STEER DRIVE","DT1-24":"ENGINE FLUID","DT1-25":"UNIV",
"DT1-26":"MECH WEAR DRIVE CONV CRUSH","DT1-27":"DRIVE ENGINE CONV","DT0-00":"UNIV",
"DT5-01":"FLUID HYD MECH CONV CRUSH SCREEN ENGINE FILTER","DT5-02":"UNIV","DT5-09":"UNIV",
"DT13-02":"HYD","DT13-03":"HYD","DT13-04":"FILTER HYD FLUID","DT13-05":"HYD FLUID",
"DT9-01":"GET","DT9-02":"GET","DT9-03":"UC","DT9-04":"UC","DT9-05":"TYRE","DT9-06":"TYRE","DT9-07":"TYRE",
"DT10-01":"DRIVE","DT10-02":"DRIVE","DT10-03":"DRIVE","DT10-04":"BRAKE","DT10-05":"BRAKE","DT10-06":"STEER",
"DT11-01":"DRILL","DT11-02":"DRILL","DT11-03":"DRILL","DT12-01":"SAFETY","DT12-02":"SAFETY",
}
def tag_for(code):
    if code in TAGS: return TAGS[code]
    g=code.split('-')[0]
    return {"DT3":"CI ELEC","DT4":"ELEC","DT6":"STRUCT","DT7":"CRUSH SCREEN","DT8":"CONV",
            "DT14":"OIL","DT15":"FILTER"}.get(g,"UNIV")

# Extension entries closing real gaps (NOT in 1C - flag for import into 1C).
EXTRA_GROUPS={
 "DT14":{"en":"Oil & wear debris (magnetic plug / oil)","ru":"Масло и продукты износа (магнитная пробка)"},
 "DT15":{"en":"Filter findings (filter cut)","ru":"Результаты разреза фильтра"}}
EXTRA=[
 ("DT14-01","DT14","Ferrous debris — light / normal","Ферромагнитные частицы — незначительно / норма","OIL"),
 ("DT14-02","DT14","Ferrous debris — moderate","Ферромагнитные частицы — умеренно","OIL"),
 ("DT14-03","DT14","Ferrous debris — heavy / chips / flakes","Ферромагнитные частицы — обильно / стружка / чешуйки","OIL"),
 ("DT14-04","DT14","Non-ferrous debris (bronze / aluminium)","Немагнитные частицы (бронза / алюминий)","OIL"),
 ("DT14-05","DT14","Water in oil","Вода в масле","OIL"),
 ("DT14-06","DT14","Coolant in oil","Охлаждающая жидкость в масле","OIL"),
 ("DT14-07","DT14","Fuel dilution","Разжижение топливом","OIL"),
 ("DT14-08","DT14","Oil degradation / discolouration / smell","Деградация масла / изменение цвета / запах","OIL"),
 ("DT14-09","DT14","Oil viscosity out of specification","Вязкость масла вне нормы","OIL"),
 ("DT15-01","DT15","Ferrous debris in filter media","Ферромагнитные частицы в фильтре","FILTER"),
 ("DT15-02","DT15","Non-ferrous debris in filter media","Немагнитные частицы в фильтре","FILTER"),
 ("DT15-03","DT15","Filter media damaged / ruptured","Повреждение / разрыв фильтрующего элемента","FILTER"),
 ("DT15-04","DT15","Filter bypass indication","Признак срабатывания байпаса фильтра","FILTER"),
 ("DT15-05","DT15","Abnormal contamination (silt / varnish / sludge)","Аномальное загрязнение (шлам / лак / отложения)","FILTER"),
 ("DT13-05","DT13","Hose / line chafing or damage","Перетирание / повреждение рукава или трубопровода","HYD FLUID"),
 ("DT10-07","DT10","Bearing damage / failure","Повреждение / разрушение подшипника","MECH DRIVE"),
]
# Redundant / vague -> drop from the picker (kept out of the merged list)
DROP={"DT13-01"}     # "Hydraulic system fault" - too vague; covered by specific modes
# True duplicate inside 1C (kept but hidden from picker; flagged to the user)
HIDE={"DT4-15"}      # duplicate of DT4-23 charging system fault
