# FlowCards (v2.2.0)

カード単位で、項目を並べ、フローを設定して構成を表す。考えるための補助ツール

![icon](./.github/images/icon.png)

---

## 📖 概要 (Overview)

このアプリケーションは、構成を考えるための補助ツールアプリです。
ユーザーはカード単位で項目を並べることを通して、どのような構成が必要か考える時に役立つことを目指しています。
カードにはテキスト情報だけでなく、ファイルやURL、写真などの添付ファイルを追加して、情報を一元管理できます。
現時点では、ローカルで動き、ネットワークにつなげて情報を得るような機能は持っていません。
開発の背景には、自分のスマートホンで、このようなツールを利用したい思いがありました。

---

## ✨ 主な機能 (Features)

* **フロー管理**: フローの作成、更新、削除
* **カード操作**: フロー内でのカードの追加、更新、削除
* **階層化**:
    * カードをまとめて一つの親カードにする
    * カードの内部で、子カードとしてフローを構成する
    * カードを展開して内部の階層構造を透過的に表示する
* **関連付け**: カード同士を線で結び、関係性（フロー）を視覚化する
* **カスタマイズ**:
    * カードのサイズを3段階（S/M/L）で変更
    * カードごとに背景色を設定
* **添付ファイル**:
    * カードにファイル（画像, PDF, テキスト等）を添付
    * WebサイトのURLを添付し、プレビューを表示
*   **整列機能**: 選択した複数のカードを、上下左右や中央に一括で整列
*   **エクスポート**: フローデータをJSON形式(.canvas)でエクスポート

---

## 📱 スクリーンショット (Screenshots)

### iOS

|フローリスト|フローエディタ|カード編集|
|:---:|:---:|:---:|
|![iOS-01](./.github/images/iOS/screenshot-01.png)|![iOS-02](./.github/images/iOS/screenshot-06.png)|![iOS-03](./.github/images/iOS/screenshot-04.png)|
|リンクモード|シースルーモード|添付ファイル|
|![iOS-04](./.github/images/iOS/screenshot-05.png)|![iOS-05](./.github/images/iOS/screenshot-07.png)||

### Android

|フローリスト|フローエディタ|カード編集|
|:---:|:---:|:---:|
|![Android-01](./.github/images/Android/screenshot-01.png)|![Android-02](./.github/images/Android/screenshot-02.png)|![Android-03](./.github/images/Android/screenshot-03.png)|
|リンクモード|シースルーモード|添付ファイル|
|||![Android-06](./.github/images/Android/screenshot-04.png)|

---

## 🛠️ 技術スタック (Tech Stack)

* **フレームワーク**: React Native
* **言語**: JavaScript
* **UIライブラリ**:
    * React Native Paper
    * React-Native-Skia (描画)
    * React-Native-Reanimated (アニメーション)
* **状態管理**: React Hooks (useState, useMemo, etc.)
* **ナビゲーション**: React Navigation
* **データベース**: react-native-sqlite-storage
* **ファイル管理**:
    * react-native-fs
    * @react-native-documents/picker
* **その他**: 開発にGemini Cli, Github Copilotを利用

---

## 🚀 インストール・利用方法

**1. 前提条件 (Prerequisites)**
* Node.js (v22.17.0)
* Yarn
* etc..

**2. リポジトリをクローン**
```bash
git clone https://github.com/koto2730/flowcards.git
cd flowcards
```

## 🙌 コントリビュート (Contributing)
このプロジェクトへのコントリビュートに興味を持っていただきありがとうございます！
Issueの起票やPull Requestの送付を歓迎します。

## 📜 ライセンス (License)
このプロジェクトはMITライセンスの下で公開されています。
詳細については LICENSE ファイルをご覧ください。

## 👤 作者 (Author)
koto2730

GitHub: [https://github.com/koto2730](https://github.com/koto2730)

X (Twitter): [@koto2730oss]