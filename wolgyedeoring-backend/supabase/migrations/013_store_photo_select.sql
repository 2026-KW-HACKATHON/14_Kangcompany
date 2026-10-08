-- 013: 가게 대표 사진 업로드 시 "new row violates row-level security policy" 수정
--
-- 원인: Storage 업로드는 storage.objects 에 insert 후 결과 행을 다시 읽는다(upsert 시엔 기존 행 조회도).
--       008 에는 insert/update/delete 정책만 있고 select 정책이 없어 업로드가 RLS 위반으로 실패했다.
--       (버킷이 public 이어도 공개 URL 읽기만 허용될 뿐, API 경유 select 는 정책이 필요)
-- 조치: store-photos 버킷의 select 를 허용 (사진은 원래 공개 자료)

do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'objects') then
    execute 'drop policy if exists store_photos_public_select on storage.objects';
    execute $p$create policy store_photos_public_select on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'store-photos')$p$;
  end if;
end $$;
