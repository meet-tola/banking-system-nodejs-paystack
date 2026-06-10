require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");
const searchUsers = async (query) => {
  return await axios.get(
    `${process.env.AUTH_SERVICE_URL}/api/user/search-users?query=${query}`,
    {
      headers: {
        "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN,
      },
    }
  );
};

const fetchUsersByIds = async (userIdsArray) => {
  return await axios.post(
    `${process.env.AUTH_SERVICE_URL}/api/user/get-users-by-ids`,
    { ids: userIdsArray },
    {
      headers: {
        "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN,
      },
    }
  );
};

module.exports = {
  searchUsers,
  fetchUsersByIds,
};