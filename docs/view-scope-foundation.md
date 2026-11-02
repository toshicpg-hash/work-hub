# 共通表示対象の基盤（開発保全）

基準: main `5fcae998bbc831c14119da0547bccd0bfdeadae7` / v1.48.7。
このファイルは開発途中の記録。アプリにはまだ接続していない。

- `view-scope.js` は表示設定のみ。account / record sheet / viewer list の組で別のlocalStorageキーを使う。業務DB、Google、権限への書込みはない。
- 初期は自分。人物はsheetID。候補は呼出側の既存権限判定を必須とし、欠落・例外は候補にしない。同一sheetIDの重複も候補にしない。同名はIDを添えて区別する。
- 会社変更で選択人物が候補外になっても、全員へ自動変更しない。保存値不正、権限外、未読込、読取失敗を区別する。保存後の読み戻し失敗を成功としない。
- 単体10群、合成ブラウザ3群。後者は実アプリ全画面の統合試験ではなく、6画面の模擬移動・再読込・候補消失・360/390/820pxのフォント150%を検証する。キーボードで選択変更後もフォーカスを維持する必要がある。
- 案件を正本にする予定UIは新方針で中止。未実装なので該当差分はない。会社Googleカレンダー正本の実装は設計確認後。現行の手動登録・更新は未変更。
- ワンタイムボードは別branch保全のまま。新しい経理role・閲覧拡大も未実装。

## 会社Googleカレンダー設計の未確定事項

1. CP/CPY/ATのcalendarIdを明示対応させる。表示名、イベント件名、住所から会社・担当を推測しない。primaryや既存個人カレンダーを初期値にしない。所有アカウント、管理担当、設定の正本・配布方法は未確定。
2. Calendar ACLのwriterはカレンダー全体の予定を書ける。作成者だけ編集というACLはない。HUBのUI制限ではGoogleアプリによる他人の予定編集を防げない。reader＋認可された仲介サービスの方式なら別設計・認証・運用が必要で、現在の静的アプリの小変更ではない。
3. extendedProperties.privateはcalendarId/eventIdごとのコピーに属し、登録者だけに秘密という意味ではない。同じ共有calendarにアクセスできる編集者から秘匿する設計には使えない。visibility:privateもwriterには詳細が見える別の属性である。
4. metadata案はschemaVersion・会社・元記録を特定する識別子・案件ID・担当sheetID・必要な担当Gmail。受付番号だけでは社員間で衝突する。金額・入金・秘密の住所は入れない。編集者が書換可能なmetadataを案件の閲覧認可として信用しない。HUBで実際の案件閲覧権限を独立確認する。
5. Googleアプリで直接作った予定にはmetadataがない。作成者と担当者は同義ではない。担当不明の扱いは明示し、推測割当しない。一般社員にも同社予定を見せる新方針と、担当不明を社長/全社だけとする既往方針の適用範囲は確認が必要。
6. Googleを正本にしながらHUBの変更を自動送信する場合、Google側で変更された日時をどちらに反映するか・競合時の処理・取消/削除・会社変更/担当変更・再送重複防止を定義する必要がある。既存gRegisterは手動・終日であり、この仕様は未実装。

公式資料（2026-11-02読取）:
- https://developers.google.com/workspace/calendar/api/v3/reference/acl
- https://developers.google.com/workspace/calendar/api/concepts/sharing
- https://developers.google.com/workspace/calendar/api/guides/extended-properties

実アカウント作成、カレンダー作成/共有、実予定登録更新、権限・認証変更は実行していない。
