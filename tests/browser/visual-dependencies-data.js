// Synthetic examples preserve the local studio's important class and ancestry relationships.
export const dependencyMarkup = `<style>
    #root{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:12px}
    #root>section{border:2px solid #94a3b8;padding:12px;min-height:115px;box-sizing:border-box;background:#f8fafc}
    #root h3{font-size:15px;margin:0 0 8px}#root ul{margin:0;padding-left:20px}
    #root input,#root button{width:auto;padding:4px;font-size:13px}#root label{display:inline;margin:0}
    .duration-date-compo input{max-width:40%}.dataselect-compo input,.inputgroup-compo input{max-width:60%}
</style>
<section id="tree" eid="TreeA" vid="v-tree" class="tree-container" data-fixture-type="tree-container">
    <h3>Tree</h3><ul id="tree-list" data-fixture-type="none"><li id="tree-li" data-fixture-type="none"><span id="tree-node" class="tree-node" data-fixture-type="tree-node">부서 노드</span></li></ul>
</section>
<section id="manual" eid="ManualTreeA" vid="v-manual" class="manual-tree-container" data-fixture-type="manual-tree-container">
    <h3>Manual Tree</h3><ul id="manual-list" data-fixture-type="none"><li id="manual-li" data-fixture-type="none"><span id="manual-node" class="manual-tree-node" data-fixture-type="manual-tree-node">상위 노드</span><ul id="manual-children" data-fixture-type="none"><li id="manual-child-li" data-fixture-type="none"><span id="manual-child" class="manual-tree-node" data-fixture-type="manual-tree-node">하위 노드</span><span id="manual-hidden" class="manual-tree-node" data-fixture-type="manual-tree-node" hidden>숨김 노드</span></li></ul></li></ul>
</section>
<section id="duration" eid="DateRangeA" vid="v-duration" class="duration-date-compo" data-fixture-type="col-compo">
    <h3>기간 입력</h3><input id="from" class="duration-date-value-compo" data-fixture-type="col-compo" value="2026-09-01"><span id="wave" data-fixture-type="none"> ~ </span><input id="to" class="duration-date-value-compo" data-fixture-type="col-compo" value="2026-09-30">
</section>
<section id="dataselect" eid="DataSelectA" vid="v-dataselect" class="dataselect-compo" data-fixture-type="col-compo">
    <h3>DataSelect</h3><input id="data-value" data-fixture-type="none" value="거래처"><button id="data-button" class="dataselect-btn-compo" data-fixture-type="text-compo"><span id="data-icon" data-fixture-type="none">찾기</span></button>
</section>
<section id="inputgroup" eid="InputGroupA" vid="v-inputgroup" class="inputgroup-compo" data-fixture-type="col-compo">
    <input id="group-value" data-fixture-type="none" value="InputGroup"><button id="group-button" class="inputgroup-btn-compo" data-fixture-type="text-compo">실행</button>
</section>
<section id="radio" eid="RadioA" vid="v-radio" class="radio-compo" data-fixture-type="col-compo">
    <h3>Radio</h3><label id="radio-label" class="form-check-label" data-fixture-type="label"><input id="radio-option" type="radio" data-fixture-type="none">옵션 A</label>
</section>
<section id="checkbox" eid="CheckboxA" vid="v-checkbox" class="checkbox-compo" data-fixture-type="col-compo">
    <h3>Checkbox</h3><label id="check-label" class="form-check-label" data-fixture-type="label"><input id="check-option" type="checkbox" data-fixture-type="none">옵션 B</label>
</section>
<section id="dropdown" eid="DropdownA" vid="v-dropdown" class="dropdown-compo" data-fixture-type="dropdown">
    <h3>Dropdown</h3><div id="dropdown-list" class="dropdown-list" data-fixture-type="dropdown"><div id="dropdown-group" class="dropdown-group" data-fixture-type="dropdown"><button id="dropdown-item" class="btn-compo" data-fixture-type="text-compo">메뉴 항목</button></div></div>
</section>
<section id="tools" data-fixture-type="none">
    <h3>개별 선택 제외</h3><ul id="pages" class="pagination" data-fixture-type="pagination"><li id="page-li" data-fixture-type="none"><a id="page-link" data-fixture-type="link-compo">1 2 3</a></li></ul><button id="linked" eid="GridButtonA" vid="v-linked" class="btn-compo" data-fixture-type="text-compo"><span id="linked-caption" class="btn-name" data-fixture-type="btn-inner">그리드 연결 버튼</span></button>
</section>`;

export const dependencySettings = Object.fromEntries([
    ['tree', 'tree', '조직도'], ['manual', 'manual-tree', '수동 조직도'], ['duration', 'durationDate', '조회 기간'],
    ['dataselect', 'dataselect', '거래처 선택'], ['inputgroup', 'inputgroup', ''],
    ['radio', 'radio', '구분'], ['checkbox', 'checkbox', '동의 항목'], ['dropdown', 'dropdown', '작업 메뉴'],
].map(([id, type, name]) => [`v-${id}`, { type, name }]));
dependencySettings['v-linked'] = { type: 'btn', name: '연결 버튼', elList: 'GridA' };
