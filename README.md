# LAMP7 Genie

LAMP7 `이벤트/트랜잭션 설정` 화면에서 로직 검색과 간단한 편집 작업을 돕는 Chrome Extension입니다.

## 목차

- [설치 가이드](#설치-가이드)
- [기능](#기능)
- [단축키](#단축키)

## 설치 가이드

1. 프로젝트를 빌드합니다.
  ```bash
   npm run build
  ```
2. Chrome에서 확장 프로그램 관리 화면을 엽니다.
  ```text
   chrome://extensions
  ```
3. 오른쪽 상단의 **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다**를 클릭합니다.
5. 프로젝트의 `dist` 폴더를 선택합니다.
6. LAMP7 `이벤트/트랜잭션 설정` 화면에서 확장 프로그램 아이콘을 클릭해 패널을 엽니다.



## 기능



### 검색

생성된 코드에서 본 변수명, Transaction 호출 메소드명, Event/Variable ID 등을 검색하면 해당 로직 위치를 찾아줍니다.

- 로직 Prefix ex) `logic18038`
- Event / Transaction / Variable ID
- Transaction 호출 메소드명
- Condition / Parameter 값

![검색 데모](./assets/demo-search.gif)

### 편집

필요한 로직을 삭제하거나, 로직을 복사해서 다른 위치에 붙여넣을 수 있습니다.

- 로직 삭제
- 로직 복사/붙여넣기

![편집 데모](./assets/demo-edit.gif)

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
