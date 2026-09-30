# 개발 및 검증

사용법과 기능 범위는 [README](../README.md)를 참고합니다. 이 문서는 유지보수에 필요한 실행 구조와 검증 방법을 정리합니다.

## Lamp7 상태 변경 규칙

**Lamp7 기본 기능을 우선 활용하되, 화면 붙여넣기의 새 컴포넌트 설정·이미지 등록은 허용합니다.** 모든 속성을 입력란으로 재입력하지 않습니다. [AGENTS.md](../AGENTS.md)와 PR 양식에도 같은 기준을 둡니다.

| 구분 | 기준 |
| --- | --- |
| 검색·검증·복사 | 읽기와 독립 복사본 변환 허용. 원본 참조 수정 금지 |
| 생성·배치 | GrapesJS 모델 API와 Lamp7 템플릿·생성·배치 함수 사용. 필요한 검증·후처리를 함께 실행 |
| 화면 붙여넣기 JSON | `snapshotPaste.ts`에서 새 VID의 설정과 새 EID의 이미지 등록 허용. 기존 키 덮어쓰기·저장소 전체 교체 금지 |
| 내부 참조 | EID·VID·DOM ID를 구분. 복사 범위 안의 연결만 재매핑. 이벤트·로직 복사 제외 |
| 실패 정리 | 이번 작업의 등록 키·생성 모델만 대상. 실제 남은 모델을 확인하고 미사용 등록 데이터와 실패한 항목을 가리키는 연결 정리. 화면 변경 시 쓰기 중단 |
| 함수 교체 | Lamp7 전역 함수·메서드·프로토타입의 임시 또는 영구 교체 금지 |
| 변수·로직 | 기본 추가·그리드 값 설정 API·완료·이동 처리 사용. 입력창 조작은 필수가 아니며 검증·연결 후처리는 유지. 내부 Map 직접 쓰기 금지 |
| Genie 상태 | 패널·하이라이트·선택 오버레이·확장 클립보드는 관리 가능. 저장 대상 DOM만 추가하여 모델과 불일치시키지 않음 |

기본 함수가 어떤 범위의 데이터를 바꾸는지 확인합니다. 기본 블록 생성 경로를 완성된 복사 트리에 다시 실행하면 Grid 기본 입력·Tree/Cascader 기본 노드가 중복 생성될 수 있습니다. 기존 항목의 삭제·전역 참조 갱신·이벤트 복사까지 하는 함수를 단지 “기본 함수”라는 이유로 호출하지 않습니다.

변경 설명에 `사용자 동작 → 기본 함수/JSON 등록 범위 → 검증·후처리`와 확인한 로컬 소스 위치를 기록합니다. 입력란이 없는 저장 속성도 복원 대상입니다. 데이터 일관성을 보장하지 못하는 경우에는 구체적인 제약을 보고합니다.

### 구현 점검 — 2026-09-30

| 기능 | 현재 처리 |
| --- | --- |
| 화면 붙여넣기 | `transferComponents.ts`가 독립 JSON에서 ID·참조·테이블 연결을 준비. `snapshotPaste.ts`만 새 컴포넌트 설정·이미지를 등록하고 생성·후처리·실패 정리 |
| 지역변수 추가 | gridAddBtn → setRowData → 기본 저장 콜백. 셀 편집창·구조 팝업을 열지 않으며 변수 Map 직접 쓰기 없음 |
| 로직 위치 붙여넣기 | createLogic → 원래 renderer.renderLogics → Sortable onStart/sort/onEnd. 순번·부모·트랜잭션 연결은 기본 처리 |
| 화면 삭제 | selectedComponent → core:component-delete. 사용자 삭제 기능은 기본 전후 처리 유지 |
| 없는 그리드 읽기 | Genie의 조회 결과를 빈 배열로 다루는 것은 읽기 보정. getGridDataAll 전역 교체는 하지 않음 |
| 검색·선택·복사 | 읽기·독립 복사본 변환과 Genie 표시 상태만 변경 |

지역변수를 먼저 등록하고 재조회한 뒤 로직을 생성합니다. 과거 `data.find` 오류의 실제 실패 그리드·호출 경로는 확정되지 않았습니다. 잘못된 그리드 응답을 주입한 모의 테스트는 정상 지역변수 붙여넣기의 오류 재현이나 “Lamp7 원본 수정만 가능”의 근거가 아닙니다.

### 지역변수 등록 경로

- 추가 버튼 → `event/edit.js`의 `gridAddBtn` → 기본값·행 ID·변수 ID 관리 및 기본 후처리.
- 값 설정 → `JqGridHelper.setRowData`로 새 행의 ID·이름·유형·구조·선언 여부를 한 번에 적용. ID 문자·예약어·유형·구조를 검증하고 유형명은 `CommonHelper`로 계산합니다. `editCell`·입력 이벤트·Select2·구조 팝업 완료 함수는 호출하지 않습니다.
- 저장 후처리 → 이벤트/트랜잭션 그리드의 `beforeSaveCell`·`afterSaveCell`. 전자는 기존 ID를 `this.p.savedRow`에서 읽으므로 새 행의 원래 ID와 행 목록을 **독립 실행 문맥**으로 전달합니다. 실제 그리드의 `savedRow`는 변경하지 않습니다. 후자는 실제 그리드에서 실행하여 기본 중복 검증·변수 ID Map·구조 Map을 갱신합니다. 이전 ID 없이 후처리만 호출하면 기존 로직의 비어 있는 참조까지 바꿀 수 있으므로 금지합니다.
- 구조는 신규 행에 먼저 설정하고 ID 저장 후처리가 구조 Map에 등록하게 합니다. 새 변수에는 아직 붙여넣을 로직이 연결되지 않았으므로 기존 변수의 유형 변경·구조 팝업 완료 경로를 재현하지 않습니다. 구조 버튼 표시만 새 행에 맞춥니다. 전체 설정 재조회가 일치한 뒤 로직을 생성합니다.
- 취소 → 편집 셀의 `restoreCell` → 새로 만든 행만 기본 선택 API로 선택 → `gridDelBtn`. 취소 실패 시 남은 행을 숨기거나 내부 저장소를 직접 복구하지 않습니다.

로컬 기준 소스는 `D:/02.Workspace/studio_cloud/studio/src/main/resources/static/`입니다. 지역변수 테스트는 충돌 채번, 객체 참조, 선언 여부, 기본 입력 거절, 추가 후 예외, 취소 실패, 대상 변경과 MAIN 직렬화를 확인합니다. 로컬 소스가 있으면 `eventInfoEdit.js`와 `transactionEdit.js`의 실제 저장 콜백도 추출하여 ID·구조 등록과 중복 거절을 검증합니다. 그리드/DOM은 모의 환경이므로 서버 화면에서의 저장·재열기 검증은 별도입니다.

기존 `close` 오류 경로: jqGrid의 `editCell`은 `setTimeout(..., 0)`에서 Select2를 초기화·열지만 Genie는 즉시 `endEdit`을 호출했습니다. `saveCell`이 초기화 전 `select2('close')`를 호출하면 없는 인스턴스의 `close` 접근에서 실패하고, 예약된 초기화가 뒤늦게 실행되어 선택창이 나타날 수 있습니다. 신규 등록은 이 편집창 경로를 사용하지 않습니다.

## 화면 붙여넣기 처리 경로

`위치 클릭 → transferVisualComponents → pasteVisualSnapshot → 새 항목 검증·후처리` 순서입니다.

1. 대상 문서·프레임·선택 토큰·위치를 검증합니다. GrapesJS draggable/droppable과 Lamp7의 드롭 제한을 유지합니다.
2. 세션변수 목록을 붙여넣기당 한 번 조회합니다. EID는 원래 값을 유지하고 충돌 시 Lamp7 veuid 채번 규칙과 기존 DOM·이벤트·이미지·세션변수 및 이번 배치의 예약 목록을 확인합니다. DOM ID·VID는 새로 생성하며 속성마다 재발급하지 않습니다.
3. 독립 JSON에서 내부 참조·기간 from/to·복합 버튼 ID·라디오 그룹·탭/그룹 DOM 연결을 변경합니다. Grid 반복 셀은 EID/VID를 공유하고 DOM ID만 따로 만듭니다. 외부 참조·이벤트·로직은 제거하고, 대상에 없는 테이블/열 연결만 해제합니다.
4. 필요한 새 Row·Col은 Lamp7 `BlockHelper → append → createSettingInfo`를 사용합니다. 이는 `drawRow/drawCol`의 생성 순서이며, Col에도 복사본 전체 EID 예약 목록을 전달하기 위해 직접 조합합니다. 임의로 기본 설정 스키마를 재구현하지 않습니다.
5. 각 루트를 생성하기 직전에 필요한 새 설정·이미지 키를 등록하고 완성된 트리를 GrapesJS `append`로 생성합니다. 모든 루트 설정을 먼저 등록한 채 비동기로 기다리지 않습니다. 설정은 VID마다 한 번만 등록합니다. 기존 키가 있거나 반복 셀의 공유 설정이 다르면 생성 전에 중단합니다.
6. 속성·설정·자식 구조·내용·클래스·스타일을 확인합니다. 숨김 표시는 대상 `#hiddenToggle` 상태에 맞추되 hiddenYn과 data-hidden은 보존합니다. 검색 영역의 새 항목에는 대상 검색 컨테이너 연결을 적용합니다.
7. 모든 루트가 생긴 다음 새 Grid에만 `setGridCalWidth/setGridHeaderResize`, layer view가 준비된 새 숨김 항목에만 `setLayerTab`, 마지막에 캔버스 크기 갱신을 수행합니다. 탭/그룹 연결은 변환한 DOM ID를 사용합니다. 속성창 렌더링·개별 change 이벤트·파일 재업로드는 하지 않습니다.
8. 진행 상태를 표시하고 실제 생성된 항목 ID를 반환합니다. 실패 시 생성된 항목을 남기고, 이번에 등록했으나 쓰이지 않는 데이터 및 실패한 항목을 가리키는 새 항목의 연결만 정리합니다. 기본 삭제가 기존 빈 부모까지 제거할 수 있어 자동 일괄 삭제는 하지 않습니다. 화면이 변경되면 다른 화면에 정리 쓰기를 하지 않습니다.

### 근거와 지원 범위

- 로컬 소스: `D:/02.Workspace/studio_cloud/studio/src/main/resources/static/js/screen/`.
- `visualEditorSetting.js`의 `subScreenCopy/changeIdByCopySubScreenAttrs`도 컴포넌트와 설정 복사 후 ID를 보정합니다. 그러나 기존 대상 비우기와 전역 참조·이벤트 갱신이 있어 이 함수를 통째로 호출하지 않습니다.
- `visualEditorCanvas.js`의 `drawRow/drawCol/createSettingInfo` 호출 순서를 재사용합니다. 완성된 복사본에는 `canvas:drop`을 보내지 않아 Grid·Tree·Cascader 기본 자식의 중복 생성을 피합니다.
- `visualEditorEvent.js`의 `component:add`는 캔버스 폭 갱신만 예약하므로 Grid 배치 후처리는 별도로 수행합니다.
- 입력란 없는 hiddenYn·라벨 mandatoryYn, 옵션·매핑·이미지·스타일·복합 내부 구조는 JSON에서 함께 복원합니다. 기존 `nativePaste.ts/nativePasteDetails.ts`의 속성별 UI 재생 경로는 제거했습니다.
- 개별 탭 제목은 복사 루트로 허용하지 않습니다. 일반 Tab 그룹 전체는 지원합니다. 별도 서브스크린 순번·주 화면 상태를 가진 Sub-screen 그룹 전체 복사는 계속 미지원이며 내부 Row·컴포넌트를 복사합니다.
- 업로드 파일 데이터는 새 이미지 키로 복사하고 저장 이미지 주소는 유지합니다. 주소가 대상 환경에서도 접근 가능한지는 실제 저장·재열기로 확인합니다. 별도 자동 저장·묶음 Undo를 추가하지 않습니다.

`visualSnapshotPaste.test.mjs`는 MAIN 직렬화, 숨김·필수 여부, 복합 트리·반복 셀, 이미지 복사, 예약 EID를 고려한 기본 wrapper 생성, 정상·중간 실패·생성 후 예외·화면 변경을 검증합니다. `visualTransfer.test.mjs`는 ID·참조 변환과 전처리/실제 등록 경계도 검증합니다. 모의 테스트 통과는 실제 Lamp7 저장·재열기 검증을 대체하지 않습니다.

### 로직 생성·위치 변경 경로

- 추가 버튼의 `LogicEditor.createLogic` → `LogicRenderer.renderLogics`를 원래 객체에서 실행합니다. 복사한 부모 ID는 새 ID로 변환하고, 최상위 복사 항목도 생성 시 목적 부모를 지정합니다.
- 이동 버튼의 `LogicEventHandler.setLogicBlockNestedSortable` → 실제 Sortable의 `onStart` → `sort` → `onEnd` 순서로 처리합니다. 완료 콜백이 전체 순번·레벨·부모·트랜잭션 연결과 영향받는 항목 검증을 담당합니다. 동일 제목의 Sortable 식별 충돌을 피하는 Genie DOM 표식은 `finally`에서 복원합니다.
- 로컬 렌더러가 부분 배열을 전체 순번으로 조회하는 조건 연결선 오류는 모든 생성 행이 렌더링된 마지막 연결선 단계에서만 전체 로직 배열로 재호출합니다. 다른 렌더링 오류는 그대로 중단 상태로 반환합니다.
- `getGridDataAll` 임시 교체는 제거했습니다. 조회 대상이 없는 경우의 빈 배열 처리는 읽기 보정이며, Lamp7 내부 오류가 실제 재현되면 호출 지점과 필요한 그리드를 확인합니다. 생성 오류는 실제 생성 개수와 함께 보고합니다.

## 실행 구조 개요

- `src/content`: 패널과 대상 화면 감시, iframe 간 UI 메시지 처리.
- `src/background/targets`: 이벤트/트랜잭션 설정과 화면 설계 판별. 탭·프레임·document·session을 검증하여 오래된 요청을 거부합니다.
- `src/features/search`, `src/features/edit`: 로직 검색·선택·삭제·위치 선택 붙여넣기.
- `src/features/visualSearch`, `src/features/visualEdit`: GrapesJS 컴포넌트 검색과 편집.
- `src/shared/EditWorkspace.tsx`, `selectionOverlay.ts`: 두 화면의 공통 편집 UI와 영역 표시.
- `src/shared/types/messages.ts`: 확장 메시지 타입. MAIN world 함수는 `readFrameMemory`와 직렬화한 함수 소스로 실행합니다.

Chrome MV3 로딩 방식에 맞춰 content는 단일 IIFE, background는 ESM으로 각각 빌드합니다. MAIN 함수는 import된 런타임 값이나 `chrome` API에 직접 의존하지 않아야 합니다.

## 현재 기능과 편집 시 유지할 기준

아래는 현 구현에서 유지할 기능 기준입니다.

- 화면 설계 선택 단위는 `visualEdit/policy.ts`가 결정합니다. Grid와 복합 컴포넌트 내부를 임의로 독립 편집하지 않습니다. 버튼에 남은 `elList`만으로 Grid 도구라고 판단하지 않습니다.
- 화면 범위 선택은 가로로 잘린 항목의 **보이는 폭**과 **전체 높이**를 감싸야 합니다. 위아래가 잘리거나 완전히 화면 밖에 있는 항목은 제외하며, 선택한 부모의 화면 밖·숨김 자식은 기존처럼 함께 포함합니다. 이 판정은 Genie 선택 상태만 변경하고 Lamp7 모델·설정을 수정하지 않습니다.
- 검색 위치 이동은 `scrollWithin`으로 범위를 제한합니다. 화면 검색은 캔버스 문서 내부, 로직 검색·선택 영역 노출은 문서 루트를 제외한 스크롤 패널, 검색 목록은 목록 영역만 이동합니다. `scrollIntoView`로 부모 프레임·숨겨진 레이아웃의 스크롤을 바꾸지 않으며 Lamp7 업무 데이터나 함수는 수정하지 않습니다.
- 삭제는 Lamp7 기본 명령과 전후 처리를 사용합니다. 성공 여부는 실제 남은 모델로 확인합니다.
- 화면 설계 붙여넣기는 `draggable`/`droppable`과 Lamp7 컨테이너 제약을 검사하고 필요한 Row·Col을 생성합니다. 텍스트 노드는 삽입 위치 후보가 아닙니다.
- 공통 붙여넣기 위치가 없으면 같은 배치 판정 함수로 제한 항목과 사유를 읽어 안내합니다. 검색영역 전용 Col 등의 제약을 메시지를 위해 완화하지 않으며, 진단 과정에서는 모델·설정·클립보드를 변경하지 않습니다.
- ID는 Lamp7 채번 함수를 사용합니다. 복사 범위 안의 연결만 유지하고, 이벤트·로직 실행 연결은 제외합니다. 대상에 필요한 테이블·열을 자동으로 가져오지 않습니다.
- 로직 붙여넣기는 기본 편집 완료 처리 후 실행합니다. 부모·전체 순번·트랜잭션 연결을 다시 계산하고 영향받은 기존 로직도 검증합니다. 조건 연결선은 전체 순번을 기준으로 계산합니다.
- 일반 지역변수 정의는 복사 배열의 `__genieLocalVariables`에 함께 보관하고, 로직 생성 전에 분리합니다. 같은 정의는 재사용하며 다른 정의는 기본 채번 후 복사 로직의 참조를 변경합니다. 기존 변수는 덮어쓰지 않습니다.
- 화면 붙여넣기는 세션변수 목록을 비동기로 한 번 조회합니다. 조회 실패 시 생성하지 않습니다. 복사본에서 최종 ID를 결정하며 EID는 유지·충돌 채번, DOM ID·VID는 새로 발급합니다. 새 wrapper ID는 기본 생성에서 발급하고 복사본 EID 예약 목록과 대조합니다.
- 진행 메시지는 MAIN → content → background → 패널로 전달하고 프레임·문서·세션·요청을 구분합니다. 화면은 최상위 항목 사이에서만 실행을 양보하고 대상을 재검증합니다. 로직 생성·렌더링·연결 갱신은 하나의 동기 작업으로 유지합니다.
- 붙여넣기 직전 대상과 클릭 정보를 검증하고 요청을 한 번만 실행합니다. 일부 생성이나 통신 유실을 자동 재시도하지 않습니다.
- 자동 저장·별도 묶음 Undo를 제공하지 않습니다. 로컬 Lamp7 소스와 서버 버전이 다르면 실제 API·데이터 구조를 확인해야 합니다.

## 자동 검증

```bash
npm test
npm run lint
npm run build
```

Node 테스트는 MAIN 함수 직렬화, 대상 화면 제한, 검색 중복 제거, 선택 단위, 참조 변환, 삽입 위치, 부분 실패 및 지역변수 충돌 처리를 검증합니다.

일부 테스트는 로컬 Lamp7 소스를 읽어 실제 메서드를 합성 DOM/model에 실행합니다. `LAMP7_LOGIC_SOURCE_DIR`에 해당 소스의 `screen/event/logic` 디렉터리를 지정할 수 있으며, 소스가 없으면 해당 검증은 건너뜁니다. 화면 편집 기본 함수 검증은 `LAMP7_VISUAL_SOURCE_DIR`에 `screen` 디렉터리를 지정할 수 있습니다.

## 브라우저 검증 화면

```bash
npx vite --host 127.0.0.1
```

개발 서버에서 다음 경로를 엽니다. 합성 데이터와 Chrome 메시지 모의 구현을 사용하며, 실제 Lamp7 데이터에 대한 검증은 아닙니다.
화면 편집 브라우저 예제의 붙여넣기 어댑터도 UI 확인용 모의 구현입니다. JSON 등록·기본 생성 후처리는 `visualSnapshotPaste.test.mjs`에서 별도로 검증합니다.

| 경로 | 확인할 동작 |
| --- | --- |
| `/tests/browser/visual-search.html` | 검색·숨김 안내·강조 표시·검색 후 원본 유지 |
| `/tests/browser/scroll-boundary.html` | 검색 이동의 26px 밀림 재현, 화면·로직·목록 스크롤 범위와 중첩·확대율 검증 |
| `/tests/browser/visual-edit.html` | 화면 설계 선택·삭제·복사·붙여넣기 |
| `/tests/browser/visual-wide.html` | 가로 스크롤 좌우 위치의 범위 선택, 세로 전체 높이와 부모·숨김 자식 포함 |
| `/tests/browser/visual-grid.html` | Grid 전체 선택과 반복 셀 |
| `/tests/browser/visual-dependencies.html` | 복합 컴포넌트 선택 단위와 내부 항목 제한 |
| `/tests/browser/edit-workspace.html` | 공통 조작 바·목록·로직 붙여넣기 |

실제 Lamp7에서 저장 후 재열기, 소스 생성, Undo/Redo 및 서버 버전별 동작은 별도로 확인해야 합니다.
