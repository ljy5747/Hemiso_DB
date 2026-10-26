# Hemiso_DB

개인 성충·라인 관리 사이트. KML의 관리 흐름을 바탕으로 개인 기록에 필요한 기능만 구성했습니다.

- Google 로그인: 허용 계정 한 개만 서버에서 접근 가능
- 성충 등록·수정·삭제, 사진, 종·혈통·누대, 부모·조부모 계통 조회
- 교배 라인, 부모 연결, 유충 교체·무게 기록
- BeetleLog 성충·라인 선택 가져오기 (부모·유충 함께 가져오기)
- 연결된 기록의 양방향 동기화 및 충돌 보호
- 종·성별·상태 검색, JSON 백업, 모바일·홈 화면 추가
- 알림·댓글·회원 커뮤니티 없음

## 배포

`main` 브랜치를 공개 GitHub 저장소 `Hemiso_DB`에 업로드한 뒤 Settings → Pages → Source를 GitHub Actions로 설정합니다. 워크플로가 정적 파일만 묶어 배포합니다.

Supabase → Authentication → URL Configuration → Redirect URLs에 `https://ljy5747.github.io/Hemiso_DB/`를 **추가**합니다. 기존 BeetleLog/KML Site URL과 리디렉션 설정은 유지합니다. Google provider callback은 기존 Supabase URL을 유지합니다.

프론트엔드 `app.js`에는 공개 가능한 publishable key만 사용합니다. DB SQL은 이미 적용되었으므로 새로 실행하지 않습니다. 실제 사육정보·백업·사용자 사진을 공개 저장소에 커밋하지 마세요.

## 연동 범위

BeetleLog 연동 화면에서 가져올 항목을 직접 선택합니다. 이후 불러오기와 반영 버튼으로 연결된 기록을 갱신합니다. 양쪽에서 수정한 기록은 충돌로 표시하며 자동 덮어쓰지 않습니다. Hemiso에서 새로 만든 미연결 기록과 삭제는 BeetleLog로 자동 전파되지 않습니다. 알림은 등록하지 않습니다.

## 검증

```sh
node --check app.js
node tests/frontend.cjs
```

DB 권한·가져오기·양방향 동기화 검증: `db/verify.sql` (트랜잭션 롤백).

이미지 출처와 라이선스: [PHOTO_CREDITS.md](assets/PHOTO_CREDITS.md).
