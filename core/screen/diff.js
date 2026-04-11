export function hasScreenChanged(currentHash, previousHash){
    const isChanged = currentHash !== previousHash;
    return isChanged;
}