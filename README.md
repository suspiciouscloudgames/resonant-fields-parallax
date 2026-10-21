# Resonant Fields · Parallax

두 전시 디스플레이와 Android 모바일을 동기화하는 전시 버전.

흡연 45초 → 비 80초 → 유튜브 45초 → 경찰차 160초 → 게임 65초 → 들개 145초. 전체 9분 반복.

- 실내 가로 화면, 실외 세로 화면, 모바일 화면.
- 휴대폰: 영상 시청 중 검정 무음 영상, 게임 중 60초 관객 참여 보석 게임, 그 외 시계.
- 게임은 스와이프 또는 두 번 탭으로 인접 보석을 교환합니다. 3개 이상 맞추기, 연쇄 낙하, 점수, 4·5개 매치 특수 보석을 지원합니다.
- 메뉴·일시정지·힌트 그림은 클릭되지 않으며 보석판만 입력을 받습니다.
- PC가 게임 상태를 계산하며 관객의 조작과 점수는 캐릭터가 든 기기에도 반영됩니다. 60초 종료·장면 전환·연결 끊김 시 모바일 입력과 소리가 멈춥니다.
- 첨부 영상에서 추출한 보석·UI·혼합 녹음 사운드를 사용하며 영상 하단 자막은 제외했습니다. 원본 영상 파일은 포함하지 않습니다. Android 사운드는 첫 터치 후 시작됩니다.
- 인쇄 배경과 두 화면의 고정 좌표는 유지. 장면 시작 시 “테스트” 5초 표시.

Windows 실행 파일은 이 저장소의 Releases에 있습니다. 소스 테스트는 Python 3과 Chrome이 있는 Mac에서 `python3 exhibition-launcher.py --preview`로 실행합니다. Windows 전시는 `python exhibition-launcher.py`로 실행합니다.

실제 Android도 미리보기와 같은 `dist/phone.html`을 사용합니다. 같은 네트워크에서 실행 시 표시되는 PHONE 주소에 접속합니다. 출력 창의 H 키로도 주소를 확인할 수 있습니다.

검증: `node tests/blitz-game.cjs`, `python3 tests/blitz-server.py`, `node tests/exhibition-playback.cjs`, `node tests/captions.cjs`, macOS Chrome 환경의 `python3 tests/exhibition-launcher.py`. 전체화면·모바일 동기화·재접속·배경 보존을 검증했습니다. 실제 전시 PC와 Android 하드웨어 검증은 남아 있습니다. 게임부터 세 화면을 확인하려면 `python3 exhibition-launcher.py --preview --start-scene game`을 사용할 수 있습니다.
