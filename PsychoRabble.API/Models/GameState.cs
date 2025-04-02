using System.Collections.Generic;

namespace PsychoRabble.API.Models
{
    public class GameState
    {
        public List<string> AvailableWords { get; set; } = new List<string>();
        public string CurrentPhase { get; set; } = "SUBMITTING"; // e.g., SUBMITTING, VOTING, RESULTS
        public List<string> SubmittedPlayers { get; set; } = new List<string>();
        public Dictionary<string, string> SubmittedSentences { get; set; } = new Dictionary<string, string>();
        public Dictionary<string, int> Votes { get; set; } = new Dictionary<string, int>(); // PlayerName -> VoteCount
        public List<string> VotedPlayers { get; set; } = new List<string>(); // Track who has voted
        public List<string> Winners { get; set; } = new List<string>(); // Store winner(s)
        public List<string> ReadyPlayers { get; set; } = new List<string>(); // Players ready for next round
    }
}
