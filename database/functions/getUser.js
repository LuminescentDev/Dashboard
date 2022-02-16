function sleep(ms) {
	return new Promise(res => setTimeout(res, ms));
}

module.exports = client => {

	client.getUser = async function get(args) {
		let user = await client.query(`SELECT * FROM Users WHERE userID = ${args}`);
		if(!user[0]){
			require("../models/createUser.js")(client, args);
			await sleep(100);
			user = await client.query(`SELECT * FROM Users WHERE userID = ${args}`);
		}
		return user[0];
	}; 


}; 