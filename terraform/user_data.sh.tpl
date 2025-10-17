#!/bin/bash
# User data script for ECS instances

# Log everything to a file for debugging
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

echo "Starting user data script..."

# Update the system and install necessary packages
yum update -y
yum install -y docker

# Start and enable the Docker service
echo "Starting Docker service..."
systemctl start docker
systemctl enable docker

# Write the ECS agent configuration file
# This tells the ECS agent which cluster to join.
echo "Configuring ECS agent..."
mkdir -p /etc/ecs
cat <<EOF > /etc/ecs/ecs.config
ECS_CLUSTER=${cluster_name}
ECS_LOGLEVEL=info
ECS_ENABLE_TASK_IAM_ROLE=true
ECS_ENABLE_TASK_IAM_ROLE_NETWORK_HOST=true
EOF

# Start the ECS service. The agent will now register the instance with the specified cluster.
# The Amazon ECS-optimized AMI comes with the ecs-init service that starts the agent.
echo "Starting ECS service..."
systemctl start ecs
systemctl enable ecs

echo "User data script finished successfully."