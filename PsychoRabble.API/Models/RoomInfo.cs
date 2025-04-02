namespace PsychoRabble.API.Models
{
    public class RoomInfo
    {
        public string Name { get; set; } = "";
        public List<string> Players { get; set; } = new List<string>();
        public int MaxPlayers { get; set; } = 4;
    }
}
