import xlrd, re, json
sh=xlrd.open_workbook("/root/.claude/uploads/1f3ebdba-c3da-5675-b557-e45dfee4b57e/cf490d29-Defect_type.xls").sheet_by_index(0)
def split_en_ru(nm):
    """EN | RU: everything before the first Cyrillic char is English (drop a trailing separator)."""
    nm=re.sub(r'^\s*\d+(\.\d+)?\s*','',str(nm).strip())
    m=re.search(r'[А-Яа-яЁё]',nm)
    if not m: return nm.strip(),""
    en=nm[:m.start()].rstrip().rstrip('/').rstrip()
    return en, nm[m.start():].strip()
GRP={}; items=[]
for r in range(1,sh.nrows):
    wc=str(sh.cell_value(r,0)).strip(); nm=str(sh.cell_value(r,1)).strip(); cd=str(sh.cell_value(r,2)).strip()
    if not cd: continue
    en,ru=split_en_ru(nm)
    if re.fullmatch(r'DT\d+',cd): GRP[cd]={"en":en,"ru":ru}
    elif re.fullmatch(r'DT\d+-\d+',cd): items.append({"c":cd,"g":cd.split('-')[0],"en":en,"ru":ru,"wc":wc})
CAUSE_LIKE={"DT5-03","DT5-04","DT5-05","DT5-06","DT5-07","DT5-08","DT5-10","DT5-11","DT5-12","DT5-13","DT5-14","DT5-15"}
defects=[i for i in items if i["c"] not in CAUSE_LIKE]; moved=[i for i in items if i["c"] in CAUSE_LIKE]
tax=json.loads(re.search(r'window\.TAX = (\{.*\});',open('/home/user/Condition-Monitoring/mobile/taxonomy.js',encoding='utf-8').read(),re.S).group(1))
hme={d['c']:d for d in tax['defects']}
M={"DT1-01":["DT-LEK-01","DT-LEK-02","DT-LEK-03"],"DT1-02":["DT-TMP-01","DT-TMP-02"],"DT1-03":["DT-PRS-01"],
 "DT1-04":["DT-MEC-01"],"DT1-05":["DT-MEC-09"],"DT1-06":["DT-MEC-04"],"DT1-07":["DT-MEC-07"],"DT1-08":["DT-MEC-03"],
 "DT1-09":["DT-MEC-08"],"DT1-10":["DT-MEC-05"],"DT1-11":["DT-PRS-02"],"DT1-12":["DT-FLU-01"],"DT1-13":["DT-CNT-01"],
 "DT1-14":["DT-CNT-01"],"DT1-15":["DT-PER-02"],"DT1-16":["DT-TMP-02"],"DT1-17":["DT-PER-04"],"DT1-18":["DT-PER-01"],
 "DT1-19":["DT-PER-06"],"DT1-20":["DT-PER-05"],"DT1-21":["DT-PER-07"],"DT1-22":["DT-PER-05"],"DT1-23":["DT-MEC-06"],
 "DT1-24":["DT-TMP-01"],"DT1-25":["DT-PER-04"],"DT1-26":["DT-MEC-02"],"DT1-27":["DT-DRIV-01"],
 "DT3-01":["DT-ELE-06"],"DT3-02":["DT-ELE-02"],"DT3-06":["DT-ELE-02"],"DT3-07":["DT-ELE-06"],"DT3-09":["DT-ELE-06"],
 "DT3-13":["DT-ELE-08"],"DT4-01":["DT-ELE-01"],"DT4-02":["DT-ELE-01"],"DT4-03":["DT-ELE-01"],"DT4-06":["DT-ELE-03"],
 "DT4-12":["DT-ELE-03"],"DT4-14":["DT-ELE-05"],"DT4-15":["DT-ELE-04"],"DT4-16":["DT-ELE-04"],"DT4-23":["DT-ELE-04"],
 "DT6-01":["DT-MEC-03"],"DT6-02":["DT-MEC-03"],"DT6-03":["DT-MEC-03"],"DT6-04":["DT-MEC-04"],"DT6-05":["DT-MEC-07"],
 "DT6-07":["DT-MEC-05"],"DT5-01":["DT-BLK-01"],"DT5-02":["DT-CNT-01"],
 "DT7-01":["DT-CRU-01"],"DT7-02":["DT-CRU-01"],"DT7-03":["DT-CRU-02"],"DT7-05":["DT-CRU-01"],"DT7-06":["DT-CRU-01"],
 "DT7-07":["DT-CRU-02"],"DT7-08":["DT-SCR-01"],"DT7-09":["DT-SCR-01"],"DT7-10":["DT-SCR-02"],"DT7-11":["DT-CRU-01"],
 "DT8-01":["DT-CON-01"],"DT8-02":["DT-CON-01"],"DT8-03":["DT-CON-01"],"DT8-04":["DT-CON-01"],"DT8-05":["DT-CON-01"],
 "DT8-08":["DT-BLK-01"]}
merged=[{"c":d["c"],"g":d["g"],"en":d["en"],"ru":d["ru"],"hme":M.get(d["c"],[])} for d in defects]
ADD_GROUPS={"DT9":{"en":"Mining wear components (GET / UC / tyres)","ru":"Изнашиваемые элементы (зубья / ходовая / шины)"},
 "DT10":{"en":"Drive, brake & steering","ru":"Трансмиссия, тормоза, рулевое"},"DT11":{"en":"Drilling","ru":"Буровые"},
 "DT12":{"en":"Safety systems","ru":"Системы безопасности"},"DT13":{"en":"Hydraulics & filtration","ru":"Гидравлика и фильтрация"}}
ADD={"DT9":["DT-MIN-01","DT-MIN-02","DT-MIN-03","DT-MIN-04","DT-MIN-05","DT-MIN-06","DT-MIN-07"],
 "DT10":["DT-DRIV-01","DT-DRIV-02","DT-DRIV-03","DT-BRK-01","DT-BRK-02","DT-STR-01"],
 "DT11":["DT-DRL-01","DT-DRL-02","DT-DRL-03"],"DT12":["DT-SAF-01","DT-SAF-02"],
 "DT13":["DT-HYD-01","DT-HYD-02","DT-HYD-03","DT-FLT-01"]}
for g,codes in ADD.items():
    for i,hc in enumerate(codes,1):
        h=hme.get(hc)
        if h: merged.append({"c":f"{g}-{i:02d}","g":g,"en":h["en"],"ru":h["ru"],"hme":[hc]})
GRP.update(ADD_GROUPS); GRP["DT5"]={"en":"External & operating conditions","ru":"Внешние и эксплуатационные условия"}
merged.append({"c":"DT0-00","g":"DT1","en":"Not confirmed / to be investigated","ru":"Не подтверждено / требует проверки","hme":["DT-DQ-01"]})
causes=list(tax['causes'])
for m in moved: causes.append({"c":m["c"],"g":"External & operating causes","en":m["en"],"ru":m["ru"],"dt":[],"as":["ALL PRIMARY HME"],"any":1})
cgru=dict(tax['causeGroupRu']); cgru["External & operating causes"]="Внешние и эксплуатационные причины"
js=("// AUTO-GENERATED merged defect taxonomy: 1C CMMS codes (spine) + HME mobile-equipment modes.\n"
    "// 1C 'external factor' entries that are really causes were moved into the cause list.\n"
    "window.TAX2 = "+json.dumps({"groups":GRP,"defects":merged,"causes":causes,"causeGroupRu":cgru},ensure_ascii=False)+";\n")
open('/home/user/Condition-Monitoring/mobile/taxonomy2.js','w',encoding='utf-8').write(js)
print("defects:",len(merged),"groups:",len(GRP),"causes:",len(causes))
for c in ["DT1-01","DT1-02","DT6-08","DT9-01"]:
    d=[x for x in merged if x["c"]==c]
    if d: print(" ",c,"|",d[0]["en"],"|",d[0]["ru"][:34])
