(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 root.SpanishFlashcardsVocabulary=api;
})(typeof self!=="undefined"?self:this,function(){
 "use strict";
 const entries=[
  ["acampar","to camp","Vacation Activities"],
  ["dar una caminata","to take a walk / to hike","Vacation Activities"],
  ["estar de vacaciones","to be on vacation","Vacation Activities"],
  ["hacer una excursión","to go on an excursion / to go on a day trip","Vacation Activities"],
  ["mandar tarjetas postales","to send postcards","Vacation Activities"],
  ["montar a caballo","to ride a horse","Vacation Activities"],
  ["pescar","to fish","Vacation Activities"],
  ["el tiempo libre","free time","Vacation Activities"],
  ["tomar fotos","to take photos","Vacation Activities"],
  ["el turista / la turista","tourist","Vacation Activities"],
  ["ver las atracciones","to see the sights / to go sightseeing","Vacation Activities"],
  ["visitar un museo","to visit a museum","Vacation Activities"],
  ["el alojamiento","lodging / accommodation","Vacation Lodging"],
  ["el ascensor","elevator","Vacation Lodging"],
  ["la habitación","room / hotel room","Vacation Lodging"],
  ["doble","double / double room","Vacation Lodging"],
  ["individual","single / single room","Vacation Lodging"],
  ["hacer una reservación","to make a reservation","Vacation Lodging"],
  ["tener una reservación","to have a reservation","Vacation Lodging"],
  ["el hostal","hostel / inn","Vacation Lodging"],
  ["el hotel","hotel","Vacation Lodging"],
  ["la llave","key","Vacation Lodging"],
  ["la recepción","reception / front desk","Vacation Lodging"],
  ["anteayer","the day before yesterday","Past Time"],
  ["el año pasado","last year","Past Time"],
  ["el mes pasado","last month","Past Time"],
  ["la semana pasada","last week","Past Time"],
  ["Le dejo… en…","I'll let you have it for… / I'll give it to you for…","Expressions"],
  ["Me gustaría…","I would like…","Expressions"],
  ["¿Podría ver…?","Could I see…?","Expressions"],
  ["¡Qué bello! / ¡Qué bella!","How beautiful!","Expressions"],
  ["¡Qué caro! / ¡Qué cara!","How expensive!","Expressions"],
  ["el anillo","ring","Gifts and Souvenirs"],
  ["el arete","earring","Gifts and Souvenirs"],
  ["las artesanías","handicrafts / crafts","Gifts and Souvenirs"],
  ["el collar","necklace","Gifts and Souvenirs"],
  ["las joyas","jewelry","Gifts and Souvenirs"],
  ["el recuerdo","souvenir","Gifts and Souvenirs"],
  ["la tarjeta postal","postcard","Gifts and Souvenirs"],
  ["bello / bella","beautiful","Gifts and Souvenirs"],
  ["caro / cara","expensive","Gifts and Souvenirs"],
  ["demasiado / demasiada","too much / too many","Gifts and Souvenirs"],
  ["el dinero en efectivo","cash","Gifts and Souvenirs"],
  ["el mercado al aire libre","open-air market","Gifts and Souvenirs"],
  ["regatear","to bargain / to haggle","Gifts and Souvenirs"],
  ["la tarjeta de crédito","credit card","Gifts and Souvenirs"],
  ["el mar","the sea","Student Choices"],
  ["tomar el sol","to sunbathe","Student Choices"],
  ["¿adónde?","to where? / where to?","Student Choices"],
  ["anoche","last night","Student Choices"],
  ["los autos chocadores","bumper cars","Student Choices"]
 ];
 const VOCABULARY=entries.map((entry,index)=>({id:"v2-"+(index+1),es:entry[0],en:entry[1],cat:entry[2]}));
 return{VOCABULARY}
});
