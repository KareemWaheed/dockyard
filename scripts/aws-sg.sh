#!/bin/bash

# Variables
SECURITY_GROUP_ID=""
PORT_START=0
PORT_END=65535
PROTOCOL="tcp"
IP=""
DESCRIPTION=""
ENVIRONMENT=""

# Usage function
usage() {
  echo "Usage: $0 -g <SecurityGroupId> -d <Description> [-e <env>] [-i <IP Address>] [-h]"
  echo "  -g <SecurityGroupId> : AWS Security Group ID to update."
  echo "  -d <Description>     : Description to identify the rule (e.g., Kareem)."
  echo "  -e <env>             : (Optional) Environment label for display only."
  echo "  -i <IP Address>      : (Optional) IP to whitelist. Defaults to your public IP."
  echo "  -h                   : Show this help message."
  exit 1
}

# Parse command-line arguments
while getopts ":g:e:i:d:h" opt; do
  case $opt in
    g) SECURITY_GROUP_ID="$OPTARG" ;;
    e) ENVIRONMENT="$OPTARG" ;;
    i) IP="$OPTARG" ;;
    d) DESCRIPTION="$OPTARG" ;;
    h) usage ;;
    \?) echo "Invalid option -$OPTARG" >&2; usage ;;
  esac
done

if [[ -z "$SECURITY_GROUP_ID" ]]; then
  echo "Error: Security Group ID is required (-g <sgId>)."
  usage
fi

# Ensure the description is provided
if [[ -z "$DESCRIPTION" ]]; then
  echo "Error: Description is required (-d <Description>)."
  usage
fi

# If no IP was provided, fetch the public IP
if [[ -z "$IP" ]]; then
  echo "No IP address provided. Fetching public IP..."
  IP=$(curl -s http://checkip.amazonaws.com)

  # Check if IP was retrieved
  if [[ -z "$IP" ]]; then
    echo "Could not retrieve public IP. Exiting."
    exit 1
  fi
fi

# Construct the CIDR (IP address with /32 subnet)
CIDR="$IP/32"

# Search for existing rules with the given description (name)
echo "Checking existing security group rules for description: $DESCRIPTION"

# Fetch the security group rules and filter by description (if it exists)
RULE_EXISTS=$(aws ec2 describe-security-groups \
  --group-ids $SECURITY_GROUP_ID \
  --query "SecurityGroups[0].IpPermissions[?contains(IpRanges[*].Description, '$DESCRIPTION')]" \
  --output json)

# Check if rule exists (length of RULE_EXISTS should be greater than 2 if there's a match)
if [[ ${#RULE_EXISTS} -gt 2 ]]; then
  echo "A rule with description '$DESCRIPTION' already exists. Updating it with new IP: $CIDR."

  # Extract the existing CIDR associated with the description
  EXISTING_CIDR=$(echo "$RULE_EXISTS" | jq -r '.[].IpRanges[] | select(.Description == "'"$DESCRIPTION"'") | .CidrIp')

  # Revoke the old rule
  aws ec2 revoke-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --ip-permissions "[{\"IpProtocol\":\"$PROTOCOL\",\"FromPort\":$PORT_START,\"ToPort\":$PORT_END,\"IpRanges\":[{\"CidrIp\":\"$EXISTING_CIDR\",\"Description\":\"$DESCRIPTION\"}]}]"

  # Add the new rule with updated IP
  aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --ip-permissions "[{\"IpProtocol\":\"$PROTOCOL\",\"FromPort\":$PORT_START,\"ToPort\":$PORT_END,\"IpRanges\":[{\"CidrIp\":\"$CIDR\",\"Description\":\"$DESCRIPTION\"}]}]"
else
  echo "No existing rule found with description '$DESCRIPTION'. Adding a new rule."

  # Add the new rule with the specified description
  aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --ip-permissions "[{\"IpProtocol\":\"$PROTOCOL\",\"FromPort\":$PORT_START,\"ToPort\":$PORT_END,\"IpRanges\":[{\"CidrIp\":\"$CIDR\",\"Description\":\"$DESCRIPTION\"}]}]"
fi

# Check if the command succeeded
if [ $? -eq 0 ]; then
  echo "Successfully processed rule with description '$DESCRIPTION' for IP $CIDR allowing all TCP traffic in $ENVIRONMENT."
else
  echo "Failed to process rule."
  exit 1
fi