import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPointerSelectionSession } from '../src/features/edit/pointerSelectionSession.ts';

function setup() {
    let selected = new Set(), preview, commits=0;
    const rows=[{key:'one',rect:{left:100,top:100,width:700,height:40}}, {key:'two',rect:{left:100,top:150,width:700,height:60}}, {key:'three',rect:{left:140,top:220,width:660,height:35}}];
    const controller=createPointerSelectionSession({getRows:()=>rows,getSelected:()=>selected,setSelected:value=>{selected=value;},onPaint:rect=>{preview=rect;},onCommit:()=>{commits++;}});
    const event=(x,y,id=1)=>({clientX:x,clientY:y,pointerId:id,button:0});
    return {controller,event,selected:()=>[...selected],preview:()=>preview,commits:()=>commits};
}
test('logic marquee can start outside the editor and includes even partial overlap',()=>{
    const t=setup();t.controller.onPointerDown(t.event(80,90));t.controller.onPointerMove(t.event(110,155));
    assert.deepEqual(t.selected(),['one','two']);assert.deepEqual(t.preview(),{left:80,top:90,width:30,height:65});
    t.controller.onPointerUp(t.event(110,155));assert.equal(t.commits(),1);assert.equal(t.preview(),null);
});
test('logic selection is two-dimensional, not the old vertical sequence paint',()=>{
    const t=setup();t.controller.onPointerDown(t.event(20,80));t.controller.onPointerUp(t.event(60,260));
    assert.deepEqual(t.selected(),[]);
});
test('click toggles from the body, empty click preserves selection, reverse marquee adds',()=>{
    const t=setup();for(const [x,y] of [[500,120],[30,30]]){t.controller.onPointerDown(t.event(x,y));t.controller.onPointerUp(t.event(x,y));}
    assert.deepEqual(t.selected(),['one']);
    t.controller.onPointerDown(t.event(805,260));t.controller.onPointerUp(t.event(790,205));
    assert.deepEqual(t.selected(),['one','two','three']);
    t.controller.onPointerDown(t.event(500,180));t.controller.onPointerUp(t.event(500,180));
    assert.deepEqual(t.selected(),['one','three']);
});
test('cancel rolls back the entire preview without committing; another pointer cannot finish it',()=>{
    const t=setup();t.controller.onPointerDown(t.event(90,90));t.controller.onPointerMove(t.event(400,240));
    assert.equal(t.selected().length,3);
    t.controller.onPointerUp(t.event(400,240,2));assert.equal(t.commits(),0);
    t.controller.onPointerCancel(t.event(400,240));assert.deepEqual(t.selected(),[]);assert.equal(t.preview(),null);
});
test('a child logic does not include the enclosing condition through its subtree bounds',()=>{
    const t=setup();t.controller.onPointerDown(t.event(160,215));t.controller.onPointerUp(t.event(200,225));
    assert.deepEqual(t.selected(),['three']);
});
