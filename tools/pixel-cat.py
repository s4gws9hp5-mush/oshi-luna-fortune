"""推しルナ占いのマスコット（白猫と三日月のドット絵）を作るスクリプト。

使い方: python3 tools/pixel-cat.py
images/ に PNG を書き出す。絵を直したいときは GRID の文字を書き換える。
（サイトの表示には不要。画像を作り直すときだけ使う）
"""
from pathlib import Path
from PIL import Image

# 1文字 = 1ドット。"." は透明
GRID = [
    "..............................",
    ".......OO............OO.......",
    "..K...OPWO..........OWPO......",
    ".KKK..OPPWO........OWPPO......",
    "..K..OWPPWWOOOOOOOOWWPPWO.....",
    ".....OWWWWWWWWWWWWWWWWWWO.....",
    "....OWWWWWWWWWWWWWWWWWWWWO....",
    "....OWWWWWWWWWWWWWWWWWWWWO.L..",
    "....OWWWWEEWWWWWWWWEEWWWWOLLL.",
    "....OWWWEWWEWWWWWWEWWEWWWO.L..",
    "....OWPPWWWWWWPPWWWWWWPPWO....",
    "....OWWWWWWWWEWWEWWWWWWWWO....",
    "....OWWWWWWWWWEEWWWWWWWWWO....",
    ".....OWWWWWWWWWWWWWWWWWWO.....",
    "......OOBBBBBBBBBBBBBBOO......",
    ".......OWWWWWWGGWWWWWWO.......",
    "......OWWWWWWWggWWWWWWWO......",
    ".O...OSWWWWWWWWWWWWWWWWSO...O.",
    ".O...OSWWWWWWWWWWWWWWWWSO...O.",
    ".OYO.OSWWOWWWWWWWWWWOWWSO.OYO.",
    ".OYYYOOOOOOOOOOOOOOOOOOOOYYYO.",
    "..OYYYYYYYYYYYYYYYYYYYYYYYYO..",
    "...OyYYYYYYYYYYYYYYYYYYYYyO...",
    "....OOyyYYYYYYYYYYYYYYyyOO....",
    "......OOOOOOOOOOOOOOOOOO......",
]

PALETTE = {
    "O": "#8a72c4",  # 輪郭（ラベンダー）
    "W": "#ffffff",  # 白猫
    "S": "#ece4f8",  # 白猫の影
    "P": "#ffb3cf",  # 耳・ほっぺ（ピンク）
    "E": "#5a4a78",  # 目・口
    "B": "#f7a8c8",  # 首輪（ピンク）
    "G": "#f6d36b",  # 鈴（淡いゴールド）
    "g": "#e3b94f",  # 鈴の影
    "Y": "#fff0a8",  # 三日月
    "y": "#f4d77e",  # 三日月の影
    "K": "#ffb3cf",  # 小さな星（ピンク）
    "L": "#c3b1ec",  # 小さな星（ラベンダー）
}


def render(grid, palette, scale):
    h, w = len(grid), len(grid[0])
    assert all(len(r) == w for r in grid), "行の長さがそろっていません"
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch != ".":
                img.putpixel((x, y), Image.new("RGB", (1, 1), palette[ch]).getpixel((0, 0)) + (255,))
    return img.resize((w * scale, h * scale), Image.NEAREST)


# 推し活タイプごとの首輪の色（js/data.js の TYPES の color と合わせる）
TYPE_COLLARS = {
    "solo": "#b9a5ef",
    "cheer": "#f7a1c4",
    "memory": "#f6d36b",
    "talk": "#9fd0f2",
    "watch": "#a8e3c8",
    "create": "#ffc6a5",
    "heal": "#ffe78a",
    "research": "#8fb8ec",
}


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "images"
    # 公式マスコット（ピンクの首輪）
    render(GRID, PALETTE, 10).save(out / "pixel-cat.png", optimize=True)
    print("images/pixel-cat.png")
    # タイプ別の白猫（首輪の色だけ変える。首輪が金色に近いときは鈴をピンクにする）
    for key, color in TYPE_COLLARS.items():
        pal = dict(PALETTE, B=color)
        if key in ("memory", "heal"):
            pal.update(G="#f7a1c4", g="#e27fab")
        render(GRID, pal, 10).save(out / f"cat-{key}.png", optimize=True)
        print(f"images/cat-{key}.png")
    # ホーム画面用アイコン（iPhoneは透過部分を黒にするので背景色を敷く）
    icon = Image.new("RGBA", (180, 180), (255, 236, 244, 255))
    cat = render(GRID, PALETTE, 5)
    icon.alpha_composite(cat, ((180 - cat.width) // 2, (180 - cat.height) // 2 + 4))
    icon.convert("RGB").save(out / "apple-touch-icon.png", optimize=True)
    print("images/apple-touch-icon.png")
