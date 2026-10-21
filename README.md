# Resonant Fields · Parallax

두 전시 디스플레이와 Android 모바일을 동기화하는 전시 버전.

흡연 45초 → 비 80초 → 유튜브 45초 → 경찰차 160초 → 게임 65초 → 들개 145초. 전체 9분 반복.

- 실내 가로 화면, 실외 세로 화면, 모바일 화면.
- 휴대폰: 영상 시청 중 검정 무음 영상, 게임 중 60초 보석 게임 미리보기, 그 외 시계.
- 게임은 현재 동기화 미리보기이며 터치 플레이는 구현 전.
- 인쇄 배경과 두 화면의 고정 좌표는 유지. 장면 시작 시 “테스트” 5초 표시.

Windows 실행 파일은 이 저장소의 Releases에 있습니다. 소스 테스트는 Python 3과 Chrome이 있는 Mac에서 `python3 exhibition-launcher.py --preview`로 실행합니다. Windows 전시는 `python exhibition-launcher.py`로 실행합니다.

실제 Android도 미리보기와 같은 `dist/phone.html`을 사용합니다. 같은 네트워크에서 실행 시 표시되는 PHONE 주소에 접속합니다. 출력 창의 H 키로도 주소를 확인할 수 있습니다.

검증: `node tests/exhibition-playback.cjs`, `node tests/captions.cjs`, macOS Chrome 환경의 `python3 tests/exhibition-launcher.py`. 전체화면·모바일 동기화·재접속·배경 보존을 검증했습니다. 실제 전시 PC와 Android 하드웨어 검증은 남아 있습니다.
