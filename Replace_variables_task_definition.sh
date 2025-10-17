# Reemplazar variables en task-definition.json
sed -i "s/ACCOUNT_ID/$ACCOUNT_ID/g" task-definition.json
sed -i "s/REGION/$REGION/g" task-definition.json

# Crear IAM roles si no existen
aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document file://task-execution-assume-role.json

aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Crear CloudWatch Log Group
aws logs create-log-group --log-group-name /ecs/nodejs-app

# Registrar Task Definition
aws ecs register-task-definition --cli-input-json file://task-definition.json