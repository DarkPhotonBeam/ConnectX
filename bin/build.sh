#!/bin/bash


BLACK='\033[0;30m'
RED='\033[0;31m'
GREEN='\033[0;32m'
BROWN='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
LIGHT_GRAY='\033[0;37m'
DARK_GRAY='\033[1;30m'
LIGHT_RED='\033[1;31m'
LIGHT_GREEN='\033[1;32m'
YELLOW='\033[1;33m'
LIGHT_BLUE='\033[1;34m'
LIGHT_PURPLE='\033[1;35m'
LIGHT_CYAN='\033[1;36m'
WHITE='\033[1;37m'
NC='\033[0m'

echo -e "${CYAN}Building React app...${NC}"
cd ../client || (echo "CD to client failed" && exit) # ./client
yarn build

cd .. # .
echo -e "\n${YELLOW}Preparing production folder...${NC}"
rm -f ./production -r
mkdir ./production

#mkdir ./production/admin
echo -e "\n${YELLOW}Copying Server files...${NC}"
rsync -av --progress ./server/* ./production/ --exclude node_modules

echo -e "\n${YELLOW}Copying Client files...${NC}"
rsync -av --progress ./client/build/* ./production/

cd bin || (echo "CD to bin failed" && exit) # ./bin

echo -e "${LIGHT_GREEN}Build successful!${NC}\n"


