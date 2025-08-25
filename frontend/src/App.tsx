import { useState, useEffect } from 'react';
import './App.css';
import { Container, Grid, Card, CardContent, CardMedia, Typography, TextField, Button, Box } from '@mui/material';

function App() {
  const [images, setImages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchImages = (query = '') => {
    const url = `http://localhost:8000/api/images${query ? `?query=${query}` : ''}`;
    console.log(`Fetching images from: ${url}`);
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        setImages(data.images);
        console.log("Images from API:", data.images);
      })
      .catch(error => {
        console.error("Failed to fetch images:", error);
      });
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const handleSearch = () => {
    fetchImages(searchQuery);
  };

  return (
    <Container maxWidth={false} disableGutters>
      <Box sx={{ p: 2 }}>
        <Typography variant="h2" component="h1" gutterBottom sx={{ mt: 4 }}>
          AI Image Manager
        </Typography>

        <Box sx={{ display: 'flex', mb: 4, gap: 2 }}>
          <TextField
            label="Search images..."
            variant="outlined"
            fullWidth
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button
            variant="contained"
            size="large"
            onClick={handleSearch}
          >
            Search
          </Button>
        </Box>
      </Box>

      {images.length > 0 ? (
        <Grid container spacing={0}>
          {images.map((image) => (
            <Grid item xs={12} sm={6} md={3} lg={2} key={image.id}>
              <Card sx={{ borderRadius: 0, height: '100%' }}>
                <CardMedia
                  component="img"
                  height="140"
                  image={`http://localhost:8000/images/${image.image_path}`}
                  alt={image.filename}
                  sx={{ objectFit: 'contain' }}
                />
                <CardContent sx={{ height: '100%' }}>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {image.prompt}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Typography variant="body1" sx={{ mt: 4 }}>
          No images found.
        </Typography>
      )}
    </Container>
  );
}

export default App;