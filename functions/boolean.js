module.exports = client => {
    client.convertBoolean = function convertBoolean(value) {
        switch (value) {
            case 1:
                return 'true';
                break;
            case 0:
                return 'false';
                break;
            case 'true':
                return 1;
                break;
            case 'false':
                return 0;
                break;
        }
    }
}