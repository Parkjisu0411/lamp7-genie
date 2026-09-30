import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollWithin } from '../src/shared/scrollWithin.ts';

function fixture() {
    const writes = [];
    const doc = { defaultView: { getComputedStyle: node => node.css } };
    Object.defineProperty(doc.defaultView, 'frameElement', { get() { throw new Error('must not access the parent frame'); } });
    function element(parent, { x=0, y=0, width=400, height=200, scrollWidth=width, scrollHeight=height, overflowX='visible', overflowY='visible', scale=1, border=0 }={}) {
        const node = { parentElement: parent, ownerDocument:doc, isConnected:true,
            clientWidth:width, clientHeight:height, offsetWidth:width+border*2, offsetHeight:height+border*2,
            clientLeft:border, clientTop:border, scrollWidth, scrollHeight, scrollTop:0, scrollLeft:0,
            css:{overflowX,overflowY},
            contains(child) { for(let n=child;n;n=n.parentElement)if(n===this)return true;return false; },
            getBoundingClientRect() {
                const p=parent?.getBoundingClientRect()??{left:0,top:0};
                const left=p.left+x-(parent?.scrollLeft??0)*scale,top=p.top+y-(parent?.scrollTop??0)*scale;
                return {left,top,width:(width+border*2)*scale,height:(height+border*2)*scale,right:left+(width+border*2)*scale,bottom:top+(height+border*2)*scale};
            },
            scrollBy({left,top,behavior}) {
                assert.equal(behavior,'instant');writes.push(this);
                this.scrollLeft=Math.max(0,Math.min(scrollWidth-width,this.scrollLeft+left));
                this.scrollTop=Math.max(0,Math.min(scrollHeight-height,this.scrollTop+top));
            },
        };
        return node;
    }
    doc.documentElement=element(null,{width:900,height:700,scrollHeight:4000});
    doc.body=element(doc.documentElement,{width:900,height:700,scrollHeight:852,overflowY:'hidden'});
    doc.scrollingElement=doc.documentElement;
    return {doc,element,writes};
}

test('canvas navigation scrolls its viewport but never accesses its parent frame',()=>{
    const {doc,element,writes}=fixture();
    const target=element(doc.body,{y:1800,height:40});
    scrollWithin(target,doc);
    assert.equal(doc.documentElement.scrollTop,1470);
    assert.equal(doc.body.scrollTop,0);
    assert.deepEqual(writes,[doc.documentElement]);
    assert.equal(target.getBoundingClientRect().top,330);
});

test('logic navigation reaches the actual panel outside logic_wrap and preserves document roots',()=>{
    const {doc,element,writes}=fixture();
    doc.body.scrollTop=26;doc.documentElement.scrollTop=7;
    const panel=element(doc.body,{y:100,height:300,scrollHeight:2500,overflowY:'auto'});
    const wrap=element(panel,{height:2500});
    const target=element(wrap,{y:1800,height:40});
    scrollWithin(target,doc.body);
    assert.equal(panel.scrollTop,1670);
    assert.equal(doc.body.scrollTop,26);assert.equal(doc.documentElement.scrollTop,7);
    assert.deepEqual(writes,[panel]);
    assert.equal(target.getBoundingClientRect().top-panel.getBoundingClientRect().top,130);
});

test('nested scroll boxes are updated inside out on both axes; hidden layout wrappers stay fixed',()=>{
    const {doc,element,writes}=fixture();
    const hidden=element(doc.body,{height:300,scrollHeight:1000,overflowY:'hidden'});
    const panel=element(hidden,{height:300,scrollHeight:1500,overflowY:'auto'});
    const inner=element(panel,{y:900,width:200,height:100,scrollHeight:600,scrollWidth:700,overflowX:'auto',overflowY:'auto'});
    const target=element(inner,{x:500,y:400,width:50,height:30});
    scrollWithin(target,doc.body);
    assert.equal(inner.scrollTop,365);assert.equal(inner.scrollLeft,350);
    assert.equal(panel.scrollTop,800);assert.equal(hidden.scrollTop,0);
    assert.deepEqual(writes,[inner,panel]);
    const rect=target.getBoundingClientRect(),area=panel.getBoundingClientRect();
    assert.equal(rect.top-area.top,135);
});

test('result list navigation stops at its boundary and does not move visible results',()=>{
    const {doc,element,writes}=fixture();
    const outer=element(doc.body,{height:500,scrollHeight:2000,overflowY:'auto'});
    const list=element(outer,{y:700,height:160,scrollHeight:1000,overflowY:'auto'});
    const target=element(list,{y:800,height:40});
    scrollWithin(target,list,'nearest');
    assert.equal(list.scrollTop,680);assert.equal(outer.scrollTop,0);
    scrollWithin(target,list,'nearest');
    assert.deepEqual(writes,[list]);
});

test('scaled bordered containers use CSS scroll units and do not scroll a large already-visible span',()=>{
    const {doc,element}=fixture();
    const panel=element(doc.body,{x:20,y:20,width:200,height:100,scrollHeight:800,scrollWidth:800,overflowX:'auto',overflowY:'auto',scale:0.5,border:2});
    const target=element(panel,{x:251,y:251,width:40,height:20,scale:0.5});
    scrollWithin(target,panel);
    assert.equal(panel.scrollTop,460);assert.equal(panel.scrollLeft,340);
    const spanning=element(panel,{y:100,height:600});
    const previous=panel.scrollTop;
    scrollWithin(spanning,panel,'nearest');
    assert.equal(panel.scrollTop,previous);
});

test('detached targets, foreign boundaries and zero-size areas cannot change scrolling',()=>{
    const {doc,element,writes}=fixture();
    const target=element(doc.body,{y:2000});
    target.isConnected=false;scrollWithin(target,doc);
    target.isConnected=true;scrollWithin(target,fixture().doc);
    scrollWithin(target,element(doc.body));
    const collapsed=element(doc.body,{height:0,scrollHeight:2000,overflowY:'auto'});
    scrollWithin(element(collapsed,{y:1000}),collapsed);
    assert.deepEqual(writes,[]);
});
