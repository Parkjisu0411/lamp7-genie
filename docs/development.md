# 개발 및 검증

사용법과 기능 범위는 [README](../README.md)를 참고합니다. 이 문서는 유지보수에 필요한 실행 구조와 검증 방법을 정리합니다.

## 실행 구조

- `src/content`: 패널과 대상 화면 감시, iframe 간 UI 메시지 처리.
- `src/background/targets`: 이벤트/트랜잭션 설정과 화면 설계 판별. 탭·프레임·document·session을 검증하여 오래된 요청을 거부합니다.
- `src/features/search`, `src/features/edit`: 로직 검색·선택·삭제·위치 선택 붙여넣기.
- `src/features/visualSearch`, `src/features/visualEdit`: GrapesJS 컴포넌트 검색과 편집.
- `src/shared/EditWorkspace.tsx`, `selectionOverlay.ts`: 두 화면의 공통 편집 UI와 영역 표시.
- `src/shared/types/messages.ts`: 확장 메시지 타입. MAIN world 함수는 `readFrameMemory`와 직렬화한 함수 소스로 실행합니다.

Chrome MV3 로딩 방식에 맞춰 content는 단일 IIFE, background는 ESM으로 각각 빌드합니다. MAIN 함수는 import된 런타임 값이나 `chrome` API에 직접 의존하지 않아야 합니다.

## 편집 시 유지할 기준

- 화면 설계 선택 단위는 `visualEdit/policy.ts`가 결정합니다. Grid와 복합 컴포넌트 내부를 임의로 독립 편집하지 않습니다. 버튼에 남은 `elList`만으로 Grid 도구라고 판단하지 않습니다.
- 삭제는 Lamp7 기본 명령과 전후 처리를 사용합니다. 성공 여부는 실제 남은 모델로 확인합니다.
- 화면 설계 붙여넣기는 `draggable`/`droppable`과 Lamp7 컨테이너 제약을 검사하고 필요한 Row·Col을 생성합니다. 텍스트 노드는 삽입 위치 후보가 아닙니다.
- ID는 Lamp7 채번 함수를 사용합니다. 복사 범위 안의 연결만 유지하고, 이벤트·로직 실행 연결은 제외합니다. 대상에 필요한 테이블·열을 자동으로 가져오지 않습니다.
- 로직 붙여넣기는 기본 편집 완료 처리 후 실행합니다. 부모·전체 순번·트랜잭션 연결을 다시 계산하고 영향받은 기존 로직도 검증합니다. 조건 연결선은 전체 순번을 기준으로 계산합니다.
- 일반 지역변수 정의는 복사 배열의 `__genieLocalVariables`에 함께 보관하고, 로직 생성 전에 분리합니다. 같은 정의는 재사용하며 다른 정의는 기본 채번 후 복사 로직의 참조를 변경합니다. 기존 변수는 덮어쓰지 않습니다.
- 화면 붙여넣기는 세션변수 목록을 비동기로 한 번 조회합니다. 조회 실패 시 생성하지 않습니다. `eid`는 기본 채번을 재사용하고 `id`·`vid`는 로컬에서 새로 생성합니다.
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

일부 테스트는 로컬 Lamp7 소스를 읽어 실제 메서드를 합성 DOM/model에 실행합니다. `LAMP7_LOGIC_SOURCE_DIR`에 해당 소스의 `screen/event/logic` 디렉터리를 지정할 수 있으며, 소스가 없으면 해당 검증은 건너뜁니다.

## 브라우저 검증 화면

```bash
npx vite --host 127.0.0.1
```

개발 서버에서 다음 경로를 엽니다. 합성 데이터와 Chrome 메시지 모의 구현을 사용하며, 실제 Lamp7 데이터에 대한 검증은 아닙니다.

| 경로 | 확인할 동작 |
| --- | --- |
| `/tests/browser/visual-search.html` | 검색·숨김 안내·강조 표시·검색 후 원본 유지 |
| `/tests/browser/visual-edit.html` | 화면 설계 선택·삭제·복사·붙여넣기 |
| `/tests/browser/visual-grid.html` | Grid 전체 선택과 반복 셀 |
| `/tests/browser/visual-dependencies.html` | 복합 컴포넌트 선택 단위와 내부 항목 제한 |
| `/tests/browser/edit-workspace.html` | 공통 조작 바·목록·로직 붙여넣기 |

실제 Lamp7에서 저장 후 재열기, 소스 생성, Undo/Redo 및 서버 버전별 동작은 별도로 확인해야 합니다.
