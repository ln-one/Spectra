#!/bin/bash

# Spectra 前后端集成测试脚本
# 测试完整的用户流程：注册 -> 登录 -> 创建项目 -> 生成课件 -> 查询状态

set -e

API_URL="http://localhost:8000/api/v1"
TEST_SUFFIX="$(python3 -c 'import uuid; print(uuid.uuid4().hex[:12])')"
TEST_EMAIL="integration_test_${TEST_SUFFIX}@example.com"
TEST_PASSWORD="Test123456"
TEST_USERNAME="testuser_${TEST_SUFFIX}"

echo "========================================="
echo "Spectra 集成测试"
echo "========================================="
echo ""

# 1. 注册
echo "1. 测试注册..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"username\":\"$TEST_USERNAME\"}")

echo "$REGISTER_RESPONSE" | python3 -m json.tool

SUCCESS=$(echo "$REGISTER_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")
if [ "$SUCCESS" = "True" ]; then
  echo "✅ 注册成功"
else
  echo "❌ 注册失败"
  exit 1
fi

ACCESS_TOKEN=$(echo "$REGISTER_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['access_token'])")
echo ""

# 2. 登录
echo "2. 测试登录..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

if [ "$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")" = "True" ]; then
  echo "✅ 登录成功"
else
  echo "❌ 登录失败"
  exit 1
fi
echo ""

# 3. 创建项目
echo "3. 测试创建项目..."
PROJECT_RESPONSE=$(curl -s -X POST "$API_URL/projects" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"集成测试项目","description":"这是一个自动化集成测试项目"}')

echo "$PROJECT_RESPONSE" | python3 -m json.tool

if [ "$(echo "$PROJECT_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")" = "True" ]; then
  echo "✅ 创建项目成功"
else
  echo "❌ 创建项目失败"
  exit 1
fi

PROJECT_ID=$(echo "$PROJECT_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['project']['id'])")
echo "项目 ID: $PROJECT_ID"
echo ""

# 4. 生成课件
echo "4. 测试生成课件..."
GENERATE_RESPONSE=$(curl -s -X POST "$API_URL/generate/courseware" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PROJECT_ID\",\"type\":\"both\"}")

echo "$GENERATE_RESPONSE" | python3 -m json.tool

if [ "$(echo "$GENERATE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")" = "True" ]; then
  echo "✅ 生成任务创建成功"
else
  echo "❌ 生成任务创建失败"
  exit 1
fi

TASK_ID=$(echo "$GENERATE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['task_id'])")
echo "任务 ID: $TASK_ID"
echo ""

# 5. 查询状态
echo "5. 测试查询生成状态..."
sleep 2  # 等待任务开始处理

STATUS_RESPONSE=$(curl -s -X GET "$API_URL/generate/tasks/$TASK_ID/status" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "$STATUS_RESPONSE" | python3 -m json.tool

if [ "$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")" = "True" ]; then
  echo "✅ 查询状态成功"
else
  echo "❌ 查询状态失败"
  exit 1
fi
echo ""

# 6. 等待生成完成（最多等待 180 秒）
echo "6. 等待生成完成..."
MAX_WAIT=180
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
  STATUS_RESPONSE=$(curl -s -X GET "$API_URL/generate/tasks/$TASK_ID/status" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  
  STATUS=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['status'])")
  PROGRESS=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['progress'])")
  
  echo "状态: $STATUS, 进度: $PROGRESS%"
  
  if [ "$STATUS" = "completed" ]; then
    echo "✅ 生成完成"
    echo "$STATUS_RESPONSE" | python3 -m json.tool
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "❌ 生成失败"
    echo "$STATUS_RESPONSE" | python3 -m json.tool
    exit 1
  fi
  
  sleep 3
  WAITED=$((WAITED + 3))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "❌ 生成超时（超过 ${MAX_WAIT} 秒）"
  exit 1
fi

echo ""
echo "========================================="
echo "集成测试完成"
echo "========================================="
