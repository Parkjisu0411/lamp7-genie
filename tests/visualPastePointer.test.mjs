import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPasteLocation, pasteIndicator } from '../src/features/visualEdit/pastePointer.ts';
const box=(modelId,left,top,width,height,extra={})=>({modelId,positions:['before','after'],depth:2,rect:{left,top,width,height},visible:{left,top,width,height},axis:'vertical',...extra});
const screen=()=>box('screen',0,0,800,600,{depth:0,positions:['inside']});

test('native vertical center scan selects insertion index in DOM order, including gaps',()=>{
    const s=screen(),a=box('a',0,20,800,100,{parentId:'screen'}),b=box('b',0,160,800,100,{parentId:'screen'});
    assert.deepEqual(findPasteLocation(300,40,[s,a,b]),{modelId:'a',position:'before'});
    assert.deepEqual(findPasteLocation(300,130,[s,a,b]),{modelId:'b',position:'before'},'native scans next midpoint instead of nearest rectangle');
    assert.deepEqual(findPasteLocation(300,230,[s,a,b]),{modelId:'b',position:'after'});
});
test('normal Input rises out of Col to Row; Button can stay in multi-col',()=>{
    const s=screen(),r=box('row',0,20,800,200,{parentId:'screen',depth:1,positions:['inside','before','after']});
    const c=box('col',10,30,350,150,{parentId:'row',depth:2,axis:'horizontal'});
    const hit=new Set(['col','row','screen']);
    assert.deepEqual(findPasteLocation(300,100,[s,r,c],hit),{modelId:'col',position:'after'});
    assert.deepEqual(findPasteLocation(300,100,[s,r,{...c,positions:['inside','before','after']}],hit),{modelId:'col',position:'inside'});
});
test('10px boundary checks all four edges and only the immediate valid parent',()=>{
    const s=screen(),c=box('c',100,100,300,200,{positions:['inside','before','after'],parentId:'screen',depth:1});
    assert.deepEqual(findPasteLocation(105,180,[s,c]),{modelId:'c',position:'before'});
    assert.deepEqual(findPasteLocation(115,180,[s,c]),{modelId:'c',position:'inside'});
    assert.deepEqual(findPasteLocation(300,295,[s,c]),{modelId:'c',position:'after'});
    assert.deepEqual(findPasteLocation(105,180,[{...s,positions:[]},c]),{modelId:'c',position:'inside'});
});
test('horizontal and wrapped rows follow native x/y limits without invented reverse handling',()=>{
    const s=screen(),a=box('a',10,20,200,80,{parentId:'screen',axis:'horizontal'}),b=box('b',230,20,200,80,{parentId:'screen',axis:'horizontal'}),c=box('c',10,120,200,80,{parentId:'screen',axis:'horizontal'});
    assert.deepEqual(findPasteLocation(50,60,[s,a,b,c]),{modelId:'a',position:'before'});
    assert.deepEqual(findPasteLocation(420,60,[s,a,b,c]),{modelId:'b',position:'after'});
    assert.deepEqual(findPasteLocation(50,160,[s,a,b,c]),{modelId:'c',position:'before'});
});
test('actual DOM hit ancestry wins overlapping rectangles; empty target shows an insertion line',()=>{
    const behind=box('behind',10,10,300,100,{positions:['inside']}),front={...behind,modelId:'front'};
    const slot=findPasteLocation(50,50,[behind,front],new Set(['front']));
    assert.deepEqual(slot,{modelId:'front',position:'inside'});
    assert.deepEqual(pasteIndicator(slot,front),{left:15,top:15,width:290,height:4});
    assert.equal(findPasteLocation(500,500,[front]),undefined);
});
test('getChildrenContainer ordering is used; forbidden first Search slot is not offered',()=>{
    const s={...screen(),children:['b','a']},a=box('a',0,200,800,100,{parentId:'other'}),b=box('b',0,20,800,100,{parentId:'other',positions:['after']});
    assert.equal(findPasteLocation(100,30,[s,a,b]),undefined);
    assert.deepEqual(findPasteLocation(100,300,[s,a,b]),{modelId:'a',position:'after'});
});
test('clipped edges cannot be clicked and scaled 10px boundaries stay in canvas units',()=>{
    const s=screen(),c=box('c',0,-100,800,400,{parentId:'screen',visible:{left:0,top:0,width:800,height:300}});
    assert.equal(findPasteLocation(200,90,[s,c]),undefined);
    assert.deepEqual(findPasteLocation(200,120,[s,c]),{modelId:'c',position:'after'});
    const scaled=box('scaled',100,100,200,100,{parentId:'screen',positions:['inside','before','after'],borderX:5,borderY:5});
    assert.equal(findPasteLocation(106,150,[s,scaled]).position,'inside');
    assert.equal(findPasteLocation(103,150,[s,scaled]).position,'after');
});
