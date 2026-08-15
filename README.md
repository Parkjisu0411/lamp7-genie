# LAMP7 Genie

LAMP7 `eventSetting` 화면에서 로직 검색과 간단한 편집 작업을 돕는 Chrome Extension입니다.

## 설치 및 사용

### 직접 빌드해서 설치

1. 프로젝트를 빌드합니다.

   ```bash
   npm run build
   ```

2. Chrome에서 확장 프로그램 관리 화면을 엽니다.

   ```text
   chrome://extensions
   ```

3. 우측 상단의 **개발자 모드**를 켭니다.

4. **압축해제된 확장 프로그램을 로드합니다**를 클릭합니다.

5. 프로젝트의 `dist` 폴더를 선택합니다.

6. LAMP7 `eventSetting` 화면에서 확장 프로그램 아이콘을 클릭해 패널을 엽니다.

### 빌드된 압축 파일로 설치

빌드가 귀찮다면 배포된 `dist` 압축 파일만 받아서 설치할 수 있습니다.

1. `dist.zip` 파일을 원하는 위치에 압축 해제합니다.

2. Chrome에서 확장 프로그램 관리 화면을 엽니다.

   ```text
   chrome://extensions
   ```

3. 우측 상단의 **개발자 모드**를 켭니다.

4. **압축해제된 확장 프로그램을 로드합니다**를 클릭합니다.

5. 압축 해제한 `dist` 폴더를 선택합니다.

6. LAMP7 `eventSetting` 화면에서 확장 프로그램 아이콘을 클릭해 패널을 엽니다.

## 단축키

- 확장 프로그램 아이콘 클릭: 패널 열기/닫기
- `Alt + Shift + F`: 패널을 열고 검색창에 포커스
- 검색창에서 `Enter`: 검색 실행 또는 다음 검색 결과로 이동
- 검색창에서 `Shift + Enter`: 이전 검색 결과로 이동
- 패널 또는 편집 모드에서 `Escape`: 패널 닫기

Chrome에서 단축키가 충돌하면 아래 화면에서 변경할 수 있습니다.

```text
chrome://extensions/shortcuts
```

## 기능

### 검색

입력한 검색어로 LAMP7 로직을 검색하고, 검색 결과 위치로 이동할 수 있습니다.

검색 대상:

- 로직 표시명
- 로직 prefix
  - 로직에 설정된 `varPrefix` 값 기준으로 검색합니다.
- Event ID
- Event input parameter ID / EID
- Transaction ID
  - `get`, `insert`, `update`, `delete`, `modify`, `call` 같은 동작 prefix가 붙은 검색어도 실제 Transaction ID와 비교해 매칭합니다.
- Transaction input/output parameter ID
- Transaction input set parameter ID
- Condition parameter ID / value
- Condition set parameter ID / value
- Variable ID
- Variable set parameter ID

#### 검색 데모

<!-- demo-search.mp4 파일을 추가한 뒤 아래 주석을 해제하세요. -->
<!-- <video src="./assets/demo-search.mp4" controls width="720"></video> -->

### 편집

LAMP7 로직 편집을 보조합니다.

- 로직 선택 모드
- 여러 로직 선택
- 선택한 로직 복사
- 선택한 로직 삭제
- 복사한 로직 붙여넣기
- 편집 영역 위치 확인 및 포커싱

#### 편집 데모

<!-- demo-edit.mp4 파일을 추가한 뒤 아래 주석을 해제하세요. -->
<!-- <video src="./assets/demo-edit.mp4" controls width="720"></video> -->

## 데모 영상 추가 방법

가장 간단한 방법은 Windows 기본 녹화 기능으로 짧게 녹화한 뒤 `assets` 폴더에 넣는 것입니다.

1. `Win + Alt + R`을 눌러 화면 녹화를 시작합니다.
2. 검색 또는 편집 기능을 10-20초 정도 시연합니다.
3. 다시 `Win + Alt + R`을 눌러 녹화를 종료합니다.
4. 생성된 `.mp4` 파일 이름을 `demo-search.mp4` 또는 `demo-edit.mp4`로 바꿉니다.
5. 프로젝트 루트에 `assets` 폴더를 만들고 파일을 넣습니다.
6. README의 데모 영역에서 `<video ...>` 주석을 해제합니다.

예:

```md
<video src="./assets/demo-search.mp4" controls width="720"></video>
```
