import { useEffect } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import React from 'react';

function BarcodeScanner({ onScan }) {
    useEffect(() => {
        const scanner = new Html5QrcodeScanner(
            "reader",
            {
                fps: 10,
                qrbox: { width: 250, height: 150 },
                aspectRatio: 1.0
            },
            false
        );

        scanner.render(
            (decodedText) => {
                onScan(decodedText);
                // ★重要: ここにあった scanner.clear() を削除しました。
                // これがあると1回読み取っただけでカメラが終了してしまいます。
                // 連続スキャンするために、カメラは起動したままにします。
            },
            (error) => {
                // 読み取り待機中のエラーは無視してOK
            }
        );

        return () => {
            scanner.clear().catch(error => console.error("Failed to clear scanner", error));
        };
    }, []);

    return (
        <div style={{ margin: "20px 0" }}>
            <div id="reader" width="100%"></div>
            <p>バーコードをカメラにかざしてください</p>
        </div>
    );
}

// ★重要: 最後の行はこれ1つだけにしてください
// 第2引数の () => true は「親が更新されても、このコンポーネントは絶対に再描画しない」という意味です
export default React.memo(BarcodeScanner, () => true);