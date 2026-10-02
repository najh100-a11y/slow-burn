/* 나눔판(함께 보기) 설정
   supabaseUrl과 supabaseAnonKey를 넣으면 나눔판이 켜지고, 처음 열 때 모임 코드를 묻습니다.
   supabaseAnonKey에는 Supabase의 Publishable key(sb_publishable_로 시작)를 넣으세요. 예전 anon key(eyJ로 시작)도 작동합니다.
   둘 중 하나라도 비워 두면 나눔판 없이 읽기, 나누기(내 문장), 이야기, 더 깊이, 내 노트만 작동합니다.
   leaderPin은 나눔판을 켜지 않았을 때만 쓰입니다(인도자 미리보기용). 나눔판을 켜면 PIN은 Supabase에서 확인합니다. */
window.BOOKCLUB_CONFIG = {
  supabaseUrl: 'https://dujqmycvyrcixcqzzynv.supabase.co',
  supabaseAnonKey: 'sb_publishable_3zHFOt3BC_-C8tVSbmdEqw_jqxR0z_L',
  leaderPin: ''
};
