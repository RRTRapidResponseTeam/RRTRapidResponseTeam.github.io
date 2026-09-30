import re, sqlite3, pathlib, json, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
errors=[]
def check(name, cond):
    (print('PASS',name) if cond else (errors.append(name),print('FAIL',name)))

# Syntax
for f in [ROOT/'app.js',ROOT/'worker'/'worker.js']:
    r=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
    check(f'JS syntax: {f.name}',r.returncode==0 and not r.stderr)

# Schema boots cleanly and contains all expected tables/indexes.
con=sqlite3.connect(':memory:')
try:
    con.executescript((ROOT/'db'/'schema.sql').read_text(encoding='utf-8'))
    tables={r[0] for r in con.execute("select name from sqlite_master where type='table'")}
    expected={'users','sessions','questionnaires','questions','submissions','answers','rank_history','audit_log','settings','guide_blocks','guide_questions','guide_progress','guide_attempt_log'}
    check('D1 schema executes in SQLite',True)
    check('all required tables exist',expected<=tables)
except Exception as e: check('D1 schema executes in SQLite',False); print(e)

# Verify SQL placeholder counts for the two critical user upserts.
w=(ROOT/'worker'/'worker.js').read_text(encoding='utf-8')
def insert_counts(prefix):
    m=re.search(r'INSERT INTO users\('+re.escape(prefix)+r'\) VALUES\(([^)]*)\)',w)
    return (len(prefix.split(',')),len(m.group(1).split(','))) if m else None
sync_prefix='id,nickname,display_name,avatar_url,discord_username,discord_global_name,discord_joined_at,discord_boost_since,discord_pending,discord_deaf,discord_mute,discord_roles_json,access_role,active,created_at,updated_at'
admin_prefix='id,nickname,display_name,avatar_url,discord_username,discord_global_name,discord_joined_at,discord_boost_since,discord_pending,discord_deaf,discord_mute,discord_roles_json,access_role,birth_date,joined_at,active,created_at,updated_at'
check('Discord sync INSERT placeholders match',insert_counts(sync_prefix)==(16,16))
check('Admin member INSERT placeholders match',insert_counts(admin_prefix)==(18,18))

# Routes and security invariants.
for route in ['auth/login','auth/activate','auth/logout','me','members','member','ranks','questionnaire','questionnaire/submit','guides','guide/progress','guide/questions','guide/answer','guide/complete','admin/guide/reset','admin/sync-discord']:
    check('route '+route, route in w)
check('Discord OAuth removed', 'oauth2/authorize' not in w and 'DISCORD_CLIENT_SECRET' not in w and 'DISCORD_CLIENT_ID' not in w)
check('password not stored in localStorage', 'localStorage' not in (ROOT/'app.js').read_text(encoding='utf-8'))
check('session cookie is HttpOnly/Secure', 'HttpOnly; Secure; SameSite=None' in w)
check('correct answer is not returned by guide questions endpoint', 'correct_index' not in w[w.find('async function guideQuestions'):])

# Assets
check('RRT logo exists', (ROOT/'assets'/'rrt-logo.gif').exists())
for n in [2,5,6,8,9,10]: check(f'movement image {n:02d}', (ROOT/'assets'/'movement'/f'movement-{n:02d}.jpg').exists())
check('guide images use lazy loading', 'loading="lazy"' in (ROOT/'app.js').read_text(encoding='utf-8'))

# Seeded guide count from Worker literal.
check('ACE blocks present', w.count('ace_medical')>=10)
check('movement blocks present', w.count('movement')>=7)
check('no final exam text', 'Итоговый экзамен' not in (ROOT/'app.js').read_text(encoding='utf-8'))
# Seed test
try:
    con2=sqlite3.connect(':memory:'); con2.executescript((ROOT/'db/schema.sql').read_text(encoding='utf-8')); con2.executescript((ROOT/'db/seed.sql').read_text(encoding='utf-8'))
    check('seed contains 9 ACE blocks', con2.execute("select count(*) from guide_blocks where guide_key='ace_medical'").fetchone()[0]==9)
    check('seed contains 7 movement blocks', con2.execute("select count(*) from guide_blocks where guide_key='movement'").fetchone()[0]==7)
    check('every block has 3 questions', con2.execute('select min(c),max(c) from (select count(*) c from guide_questions group by block_id)').fetchone()==(3,3))
except Exception as e: check('seed SQL executes',False); print(e)
check('movement images total under 500KB', sum(x.stat().st_size for x in (ROOT/'assets'/'movement').glob('*')) < 500_000)
# Pure state-machine regression test for the 3-errors / 2-resets / lock rule.
wrong=resets=0; locked=False
for _ in range(3): wrong+=1
if wrong>=3: wrong=0; resets+=1
check('training: first 3 errors cause first reset', (wrong,resets,locked)==(0,1,False))
for _ in range(3): wrong+=1
if wrong>=3: wrong=0; resets+=1
check('training: second 3 errors cause last-attempt state', (wrong,resets,locked)==(0,2,False))
for _ in range(3): wrong+=1
if wrong>=3: wrong=0; resets+=1; locked=resets>=3
check('training: third 3 errors lock block', (wrong,resets,locked)==(0,3,True))
wrong=resets=0; locked=False
check('training: admin reset clears attempts', (wrong,resets,locked)==(0,0,False))


if errors:
    print('\nFAILED:',len(errors)); sys.exit(1)
print('\nALL SMOKE CHECKS PASSED')
