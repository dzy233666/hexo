#!/usr/bin/env bash
# 服务器同步并重建博客
#
# 用法：
#   bash /home/deploy/blog-sync.sh
#
# 为什么需要它（2026-10-22 踩到的坑）：
#   hexo-abbrlink 在构建时会把 abbrlink 写回 source/_posts/*.md，还会把
#   `tags: [随笔]` 这种行内列表改写成块列表。于是每次构建后工作区都是脏的，
#   下一次 `git pull` 就会被 git 拒绝（"Please commit your changes or stash them"）。
#
#   处理办法：拉取前先丢弃 source/_posts/ 的自动改写。
#   这是安全的 —— abbrlink 由标题确定性算出（同一标题永远得到同一个哈希），
#   丢掉之后重建会重新生成同样的值，文章网址不变。
set -euo pipefail

cd /var/www/blog

echo "==> 1/3 丢弃 hexo-abbrlink 的自动改写"
git checkout -- source/_posts/ 2>/dev/null || true
dirty=$(git status --porcelain | wc -l)
if [ "$dirty" -gt 0 ]; then
  echo "    注意：工作区仍有 $dirty 处非 _posts 的改动："
  git status --short
fi

echo "==> 2/3 拉取 GitHub 最新提交"
git pull --ff-only

echo "==> 3/3 重建静态站点"
blog-deploy

echo
echo "==> 同步完成 $(date '+%F %T')"
git log --oneline -1
