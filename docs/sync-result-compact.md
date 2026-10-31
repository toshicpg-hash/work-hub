# v1.47.7 ホームの同期結果

基準main `2792e1a40cc069c15f7686138adde80e00c5205e`（v1.47.6、PR #65）。

ホームだけで全成功の結果を1行にし、native details/summaryで開閉する。ボタンのHTML・CSS・同期入口は維持。開閉状態は保存しない。予定・設定画面は従来の全結果表示。

## 完了判定と注意

ui.gsync.completeは同期関数が最後まで到達したときだけtrueにするメモリ内の表示情報。途中return/throwでもfinallyでbusy:falseとatが付くため、rows.every(ok)だけでは判定しない。通信順序・例外処理・保存・権限・同期結果行は変更しない。

complete=true、busy=false、有効な時刻、全行ok===true、既知の結果行・属性だけ、要対応注意なしのときだけ折りたたむ。未知行・追加警告属性は展開維持。通常の「未完了3件」という依頼数を文字列判定で失敗扱いしない。途中終了で成功行しかない場合も完了未確認の注意を出す。

今日未同期、指示箱の未送信/送信停止/参照先エラー、旧I系未送信完了報告をホームで外側に表示。会社の未同期・読取失敗・保存不確実の既存注意も折りたたまない。時刻と本人端末の同期日の比較はJST。会社の既存警告表示は維持する。

## 合成検証

`node tests/sync-result-browser.cjs`：21シナリオ群。社員・社長・全社・GMで1行/タップ開閉、エラー/部分失敗/busy/未完了/未知行/警告属性、今日未同期、B/I未送信、ホーム以外を確認。旧版と同期ボタンのbounding box完全一致・高さ56px。保存データは描画・開閉で不変。実gSyncAllRunに通信関数モックを与えsignin/requestBoxStopped/caseSaveUncertain/corp signinによる途中終了を確認。UTC端末でも成功時刻はJST。

390×844の合成画像8枚：docs/preview/sync-{employee,admin}-{closed,open,error,unsynced}-390.png。Chromiumのタッチエミュレーションであり、Android実機/実Google未検証。全社・GMは同じ状態のブラウザassertionを実行。

最終結果（2026-10-31）：`tests/*.cjs` 全30本をそれぞれ `node tests/<file>.cjs` で実行し全てexit 0（新規21シナリオ群を含む）。最後の差分に対して実行、変更後のテスト緩和なし。diff check成功、画像8枚目視確認。端末実データ・実Google・公開設定への操作なし。
