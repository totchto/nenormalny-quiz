"""UI tests without external/loopback network. Requires playwright and Chromium.

The environment can disallow browser navigation to localhost; these tests feed
HTML/CSS/JS and JSON via the in-memory page context, preserving the actual app
scripts, DOM and the exact same fetch result shape as GitHub Pages.
"""
import base64
import json
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
STYLE = (ROOT/'assets'/'style.css').read_text(encoding='utf-8')
JS = {
    'catalog': (ROOT/'assets'/'catalog.js').read_text(encoding='utf-8'),
    'game': (ROOT/'assets'/'quiz-engine.js').read_text(encoding='utf-8')
}
CATALOG = json.loads((ROOT/'quizzes.json').read_text(encoding='utf-8'))

def clean_html(path):
    soup=BeautifulSoup(path.read_text(encoding='utf-8'),'html.parser')
    for tag in soup.select('script[src],link[rel=stylesheet]'):
        tag.decompose()
    return str(soup)

def boot(page, mode, saved=None, quiz=None):
    path = (ROOT/'index.html') if mode == 'catalog' else ROOT/'quizzes'/quiz['slug']/'index.html'
    page.set_content(clean_html(path))
    page.add_style_tag(content=STYLE)
    store=base64.b64encode(json.dumps(saved or {},ensure_ascii=False).encode()).decode()
    payload=base64.b64encode(json.dumps(CATALOG if mode == 'catalog' else quiz,ensure_ascii=False).encode()).decode()
    page.add_script_tag(content=f'''
    (()=>{{
      const store=JSON.parse(decodeURIComponent(escape(atob('{store}'))));
      const payload=JSON.parse(decodeURIComponent(escape(atob('{payload}'))));
      Object.defineProperty(window,'localStorage',{{configurable:true,value:{{
        getItem(k){{return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null}},
        setItem(k,v){{store[k]=String(v)}},removeItem(k){{delete store[k]}},
        get dump(){{return store}}
      }}}});
      window.fetch=async () => ({{ok:true,json:async()=>payload}});
    }})();
    ''')
    page.add_script_tag(content=JS[mode])


def snapshot(page):
    return page.evaluate('window.localStorage.dump')


def answer_one(page, quiz):
    state=page.evaluate("prefix=>JSON.parse(localStorage.getItem(prefix+':session:v1'))",quiz['storagePrefix'])
    q=quiz['rounds'][state['round']]['questions'][state['question']]
    if q['type']=='choice':
        page.locator(f'#choice-list input[value="{q["correct"]}"]').locator('..').click()
    else:
        page.locator('#free-answer').fill(q['answers'][0])
    page.locator('#check-answer').click()
    assert page.locator('#answer-reveal').is_visible()


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        quizzes=CATALOG['quizzes']
        errors=[]
        for width in [320,375,390,768,1280]:
            page=browser.new_page(viewport={'width':width,'height':850})
            page.on('pageerror',lambda error: errors.append(str(error)))
            boot(page,'catalog')
            assert page.locator('.quiz-tile').count()==2
            assert page.locator('a[href="./quizzes/nenormalnaya-gruppa-2/"]').count()==1
            assert page.locator('a[href="./quizzes/perepis-nenormalnyh/"]').count()==1
            overflow=page.evaluate('document.documentElement.scrollWidth - innerWidth')
            assert overflow<=1,('overflow catalog',width,overflow)
            if width==390:
                page.screenshot(path='/mnt/data/nenormalny-pages-catalog.png',full_page=True)
            page.close()
        saved={}
        for entry in quizzes:
            quiz=json.loads((ROOT/'quizzes'/entry['slug']/'questions.json').read_text(encoding='utf-8'))
            page=browser.new_page(viewport={'width':390,'height':844})
            page.on('pageerror',lambda error: errors.append(str(error)))
            page.set_default_timeout(2000)
            boot(page,'game',saved,quiz)
            assert page.locator('#view-home').is_visible()
            assert page.locator('#home-library').get_attribute('href')=='../../index.html'
            page.locator('#home-play').click()
            num=0
            while True:
                state=page.evaluate("prefix=>JSON.parse(localStorage.getItem(prefix+':session:v1'))",quiz['storagePrefix'])
                if state['status']=='finished': break
                if state['status']=='between':
                    page.locator('#between-continue').click();continue
                if state['status']=='revealed':
                    page.locator('#next-question').click();continue
                answer_one(page,quiz)
                num+=1
                print('answered',entry['slug'],num,flush=True)
                if num==5:
                    saved=snapshot(page)
                    page.close()
                    page=browser.new_page(viewport={'width':390,'height':844})
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    page.set_default_timeout(2000)
                    boot(page,'game',saved,quiz)
                    assert page.locator('#view-home').is_visible()
                    page.locator('#home-play').click()
                    assert page.locator('#answer-reveal').is_visible()
            assert num==25,(entry['id'],num)
            assert '30' in page.locator('#finish-score').inner_text()
            assert page.locator('#view-finish').is_visible()
            if entry==quizzes[1]:page.screenshot(path='/mnt/data/nenormalny-pages-finish.png',full_page=True)
            saved=snapshot(page)
            page.close()
        page=browser.new_page(viewport={'width':390,'height':844})
        page.on('pageerror',lambda error: errors.append(str(error)))
        boot(page,'catalog',saved)
        assert page.locator('.quiz-tile').count()==2
        assert page.get_by_text('ВАШ РЕКОРД: 30 / 30').count()==2
        for entry in quizzes:
            assert json.loads(saved[entry['storagePrefix']+':session:v1'])['score']==30
            assert saved[entry['storagePrefix']+':best:v1']=='30'
        page.screenshot(path='/mnt/data/nenormalny-pages-records.png',full_page=True)
        page.close()
        assert not errors,errors
        print('PASS: catalogue responsive 320/375/390/768/1280; 2 working pages; 50 correct questions; separate records; session restores; 30/30 in each; no JS errors')
        browser.close()

if __name__=='__main__':run()
